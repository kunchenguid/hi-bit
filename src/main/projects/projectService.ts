import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ToolActivity, ToolContent } from "@shared/chat";
import type { CreateProjectInput, ProjectRecord, ProjectSummary } from "@shared/project";
import { appendJsonl, readJsonFile, readJsonl, writeJsonFile } from "../storage/json";
import { type HiBitLayout, projectDir, projectsDir } from "../storage/layout";

/** One appended logbook line recording a worker tool step (start or end). */
type ToolStepRow = {
  type: "tool_step";
  callId: string;
  turnId?: string;
  toolName?: string;
  status?: ToolActivity["status"];
  args?: unknown;
  content?: ToolContent[];
  createdAt?: string;
};

type BuildActivityRow = {
  type: "build_activity";
  turnId?: string;
  status: "started" | "completed" | "cancelled" | "failed";
  createdAt?: string;
};

type ActivityLogRow = ToolStepRow | BuildActivityRow | { type?: string; createdAt?: string };

export type ProjectPaths = {
  projectDir: string;
  projectJsonPath: string;
  mainWorkbenchDir: string;
  workbenchesDir: string;
  bitSessionsDir: string;
  botSessionsDir: string;
  buildPlansDir: string;
  botJobsDir: string;
  machinesDir: string;
  assemblyLineDir: string;
  savePointsDir: string;
  projectLogbookPath: string;
};

export type RuntimeProject = ProjectRecord &
  ProjectPaths & {
    activeBitSessionFile?: string;
    runtimeKey?: string;
  };

export class ProjectService {
  constructor(
    private readonly layout: HiBitLayout,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(profileId: string): Promise<ProjectSummary[]> {
    await mkdir(projectsDir(this.layout, profileId), { recursive: true });
    const entries = await readdir(projectsDir(this.layout, profileId), { withFileTypes: true });
    const projects: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = await readJsonFile<ProjectRecord>(
        this.pathsFor(profileId, entry.name).projectJsonPath,
      );
      if (record) projects.push(record);
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(profileId: string, input: CreateProjectInput): Promise<ProjectSummary> {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Project title is required.");
    }

    const timestamp = this.now().toISOString();
    const project: ProjectRecord = {
      schemaVersion: 1,
      id: `project_${randomUUID().replace(/-/g, "")}`,
      factoryId: this.layout.defaultFactoryId,
      profileId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const paths = this.pathsFor(profileId, project.id);
    await Promise.all([
      mkdir(paths.mainWorkbenchDir, { recursive: true }),
      mkdir(paths.workbenchesDir, { recursive: true }),
      mkdir(paths.bitSessionsDir, { recursive: true }),
      mkdir(paths.botSessionsDir, { recursive: true }),
      mkdir(paths.buildPlansDir, { recursive: true }),
      mkdir(paths.botJobsDir, { recursive: true }),
      mkdir(paths.machinesDir, { recursive: true }),
      mkdir(paths.assemblyLineDir, { recursive: true }),
      mkdir(paths.savePointsDir, { recursive: true }),
    ]);
    await this.writeStarterFiles(paths.mainWorkbenchDir, title);
    await writeJsonFile(paths.projectJsonPath, project);
    await appendJsonl(paths.projectLogbookPath, {
      timestamp,
      type: "project_created",
      projectId: project.id,
      title: project.title,
    });
    return project;
  }

  async get(profileId: string, projectId: string): Promise<RuntimeProject> {
    const paths = this.pathsFor(profileId, projectId);
    const record = await readJsonFile<ProjectRecord>(paths.projectJsonPath);
    if (!record || record.profileId !== profileId) {
      throw new Error("Project not found.");
    }
    return {
      ...record,
      ...paths,
      activeBitSessionFile: record.activeSession
        ? resolve(paths.projectDir, record.activeSession.relativePath)
        : undefined,
    };
  }

  async setActiveBitSessionFile(
    profileId: string,
    projectId: string,
    sessionFile: string | undefined,
  ): Promise<void> {
    const project = await this.get(profileId, projectId);
    const activeSession = sessionFile
      ? {
          provider: "pi" as const,
          relativePath: toProjectRelativePath(project.projectDir, sessionFile),
        }
      : undefined;
    const next: ProjectRecord = {
      schemaVersion: 1,
      id: project.id,
      factoryId: project.factoryId,
      profileId: project.profileId,
      title: project.title,
      createdAt: project.createdAt,
      updatedAt: this.now().toISOString(),
      activeSession,
    };
    await writeJsonFile(project.projectJsonPath, next);
  }

  async touch(
    profileId: string,
    projectId: string,
    updatedAt = this.now().toISOString(),
  ): Promise<void> {
    const project = await this.get(profileId, projectId);
    const next: ProjectRecord = {
      schemaVersion: 1,
      id: project.id,
      factoryId: project.factoryId,
      profileId: project.profileId,
      title: project.title,
      createdAt: project.createdAt,
      updatedAt,
      activeSession: project.activeSession,
    };
    await writeJsonFile(project.projectJsonPath, next);
  }

  async appendActivity(profileId: string, projectId: string, value: unknown): Promise<void> {
    const paths = this.pathsFor(profileId, projectId);
    const row =
      value && typeof value === "object" && !Array.isArray(value) && !("createdAt" in value)
        ? { ...value, createdAt: this.now().toISOString() }
        : value;
    await appendJsonl(paths.projectLogbookPath, row);
  }

  async closeRunningActivity(
    profileId: string,
    projectId: string,
    status: Extract<ToolActivity["status"], "completed" | "failed">,
    turnId?: string,
  ): Promise<ToolActivity[]> {
    const running = (await this.readActivity(profileId, projectId)).filter(
      (step) => step.status === "running" && (!turnId || step.turnId === turnId),
    );
    for (const step of running) {
      await this.appendActivity(profileId, projectId, {
        type: "tool_step",
        callId: step.callId,
        turnId: step.turnId,
        status,
        content: step.content,
      });
    }
    return running.map((step) => ({ ...step, status }));
  }

  /**
   * Reads persisted worker tool steps from a creation's logbook, reduced to one
   * row per callId (later rows merge onto earlier ones), kept in first-seen order.
   */
  async readActivity(profileId: string, projectId: string): Promise<ToolActivity[]> {
    const paths = this.pathsFor(profileId, projectId);
    const rows = await readJsonl<ToolStepRow>(paths.projectLogbookPath);
    const order: string[] = [];
    const byCallId = new Map<string, ToolActivity>();
    for (const row of rows) {
      if (row.type !== "tool_step" || !row.callId) continue;
      const key = `${row.turnId ?? ""}:${row.callId}`;
      const existing = byCallId.get(key);
      if (!existing) {
        order.push(key);
        byCallId.set(key, {
          callId: row.callId,
          turnId: row.turnId,
          toolName: row.toolName ?? "",
          status: row.status ?? "running",
          args: row.args,
          content: row.content ?? [],
        });
        continue;
      }
      byCallId.set(key, {
        ...existing,
        turnId: row.turnId ?? existing.turnId,
        toolName: row.toolName ?? existing.toolName,
        status: row.status ?? existing.status,
        args: row.args ?? existing.args,
        content: row.content ?? existing.content,
      });
    }
    return order.map((key) => byCallId.get(key) as ToolActivity);
  }

  async latestActivityAt(profileId: string, projectId: string): Promise<string | undefined> {
    const paths = this.pathsFor(profileId, projectId);
    const rows = await readJsonl<ActivityLogRow>(paths.projectLogbookPath);
    return rows.reduce<string | undefined>((latest, row) => {
      if (row.type === "project_created" || !row.createdAt) return latest;
      return !latest || row.createdAt > latest ? row.createdAt : latest;
    }, undefined);
  }

  /** The folder holding all of a profile's creations, for a parent to browse on disk. */
  async profileProjectsDir(profileId: string): Promise<string> {
    const dir = projectsDir(this.layout, profileId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  pathsFor(profileId: string, projectId: string): ProjectPaths {
    const dir = projectDir(this.layout, profileId, projectId);
    return {
      projectDir: dir,
      projectJsonPath: join(dir, "project.json"),
      mainWorkbenchDir: join(dir, "main-workbench"),
      workbenchesDir: join(dir, "workbenches"),
      bitSessionsDir: join(dir, "sessions", "bit"),
      botSessionsDir: join(dir, "sessions", "bots"),
      buildPlansDir: join(dir, "build-plans"),
      botJobsDir: join(dir, "jobs"),
      machinesDir: join(dir, "machines"),
      assemblyLineDir: join(dir, "assembly-line"),
      savePointsDir: join(dir, "save-points"),
      projectLogbookPath: join(dir, "logbook", "project.jsonl"),
    };
  }

  private async writeStarterFiles(mainWorkbenchDir: string, title: string): Promise<void> {
    const safeTitle = escapeHtml(title);
    await Promise.all([
      writeFile(
        join(mainWorkbenchDir, "index.html"),
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">Hi-Bit project</p>
      <h1>${safeTitle}</h1>
      <p>Ask Bit to help shape this into the web project you imagined.</p>
      <button id="spark">Try me</button>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
        "utf8",
      ),
      writeFile(
        join(mainWorkbenchDir, "styles.css"),
        `body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  font-family: system-ui, sans-serif;
  color: #1a1626;
  background: #f7f1e5;
}

.card {
  width: min(560px, calc(100vw - 48px));
  padding: 32px;
  border: 2px solid #1a1626;
  border-radius: 16px;
  background: #fff9ec;
  box-shadow: 0 4px 0 #1a1626;
}

.eyebrow {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6c5ce7;
}

button {
  border: 2px solid #1a1626;
  border-radius: 12px;
  padding: 10px 14px;
  background: #ffc244;
  box-shadow: 0 2px 0 #1a1626;
  font-weight: 700;
}
`,
        "utf8",
      ),
      writeFile(
        join(mainWorkbenchDir, "script.js"),
        `const button = document.querySelector("#spark");

button?.addEventListener("click", () => {
  button.textContent = "Bit can change this.";
});
`,
        "utf8",
      ),
    ]);
  }
}

function toProjectRelativePath(projectDir: string, path: string): string {
  const relativePath = relative(projectDir, path);
  if (relativePath.startsWith("..")) {
    throw new Error("Session file must live inside the project.");
  }
  return relativePath.split("\\").join("/");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
