import { readFile } from "node:fs/promises";
import type { ChatEvent, ChatMessage, ChatSnapshot, SendMessageResult } from "@shared/chat";
import type { ProfileSummary } from "@shared/profile";
import { type BotJobRecord, BotJobService } from "../bots/botJobService";
import { type BotPipeline, LocalBotPipeline } from "../bots/botPipeline";
import { chatMessagesFromPiMessages } from "../pi/piMessages";
import type { ProjectService, RuntimeProject } from "../projects/projectService";
import { appendJsonl, readJsonl } from "../storage/json";

export type BitRuntime = {
  sendPrompt: (
    project: RuntimeProject,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ) => Promise<{
    turnId: string;
    status: "completed" | "cancelled" | "failed";
    sessionFile?: string;
    error?: string;
  }>;
  abort: (runtimeKey: string) => Promise<void>;
  getMessages: (runtimeKey: string) => unknown[];
  isRunning: (runtimeKey: string) => boolean;
  disposeProject?: (runtimeKey: string) => void;
};

export type ProfileReader = {
  get: (profileId: string) => Promise<ProfileSummary>;
};

type BitCoordinatorServiceOptions = {
  profiles: ProfileReader;
  projects: ProjectService;
  runtime: BitRuntime;
  botJobs?: BotJobService;
  pipeline?: BotPipeline;
  now?: () => Date;
};

type ProjectLogbookEntry =
  | {
      timestamp: string;
      type: "chat_message";
      projectId: string;
      message: ChatMessage;
    }
  | {
      timestamp: string;
      type: "chat_event";
      event: ChatEvent;
    }
  | Record<string, unknown>;

export class BitCoordinatorService {
  private readonly profiles: ProfileReader;
  private readonly projects: ProjectService;
  private readonly runtime: BitRuntime;
  private readonly botJobs: BotJobService;
  private readonly pipeline: BotPipeline;
  private readonly now: () => Date;
  private readonly activeRuntimeKeys = new Map<string, string>();

  constructor(options: BitCoordinatorServiceOptions) {
    this.profiles = options.profiles;
    this.projects = options.projects;
    this.runtime = options.runtime;
    this.now = options.now ?? (() => new Date());
    this.botJobs = options.botJobs ?? new BotJobService({ now: this.now });
    this.pipeline = options.pipeline ?? new LocalBotPipeline(undefined, this.now);
  }

  async load(profileId: string, projectId: string): Promise<ChatSnapshot> {
    const project = await this.projects.get(profileId, projectId);
    const logbookMessages = await readChatMessages(project);
    const runtimeKey = this.activeRuntimeKeys.get(projectId);
    const liveMessages = runtimeKey ? this.runtime.getMessages(runtimeKey) : [];
    const messages = logbookMessages.length
      ? logbookMessages
      : chatMessagesFromPiMessages(
          liveMessages.length
            ? liveMessages
            : await readSessionMessages(project.activeBitSessionFile),
        );
    return {
      projectId,
      messages,
      tools: [],
      isRunning: runtimeKey ? this.runtime.isRunning(runtimeKey) : false,
    };
  }

  async send(
    profileId: string,
    projectId: string,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<SendMessageResult> {
    const prompt = text.trim();
    if (!prompt) {
      return { ok: false, error: "Type a message for Bit first." };
    }

    let job: BotJobRecord | undefined;
    let project: RuntimeProject | undefined;
    try {
      const profile = await this.profiles.get(profileId);
      project = await this.projects.get(profileId, projectId);
      if (this.activeRuntimeKeys.has(project.id)) {
        return { ok: false, error: "Bit is already working on this project." };
      }

      const projectCatalog = await this.projects.list(profileId);
      const plan = await this.botJobs.createBuildPlan(project, prompt, projectCatalog);
      job = await this.botJobs.createJob(project, plan);
      await appendChatMessage(project, {
        id: `lead-${job.id}`,
        role: "user",
        text: prompt,
        createdAt: this.now().toISOString(),
      });

      const workbench = await this.pipeline.prepareBotWorkbench(project, job);
      job = await this.botJobs.markRunning(project, job, workbench);
      this.activeRuntimeKeys.set(project.id, job.id);

      let assistantText = "";
      const botProject: RuntimeProject = {
        ...project,
        mainWorkbenchDir: workbench.path,
        bitSessionsDir: project.botSessionsDir,
        activeBitSessionFile: undefined,
        runtimeKey: job.id,
      };
      const result = await this.runtime.sendPrompt(
        botProject,
        botPrompt({ leadPrompt: prompt, profile, project, projectCatalog }),
        (event) => {
          if (event.type === "assistant_delta") assistantText += event.text;
          void this.projects.appendActivity(profileId, projectId, {
            timestamp: this.now().toISOString(),
            type: "chat_event",
            event,
          });
          onEvent(event);
        },
      );

      if (result.sessionFile) {
        await this.projects.setActiveBitSessionFile(profileId, projectId, result.sessionFile);
      }
      if (result.status === "failed") {
        await this.botJobs.jam(project, job, result.error ?? "Bit hit a problem.");
        return { ok: false, turnId: result.turnId, error: result.error ?? "Bit hit a problem." };
      }
      if (result.status === "cancelled") {
        await this.botJobs.cancel(project, job);
        return { ok: true, turnId: result.turnId, status: "cancelled" };
      }

      const inspections = await this.pipeline.runMachines(project, job, workbench);
      const failedInspection = inspections.find((inspection) => inspection.status === "failed");
      if (failedInspection) {
        await this.botJobs.jam(
          project,
          job,
          failedInspection.message ?? "A machine rejected the build.",
        );
        return {
          ok: false,
          turnId: result.turnId,
          error: failedInspection.message ?? "A machine rejected the build.",
        };
      }

      const build = await this.pipeline.installBotBuild(project, job, workbench);
      await this.botJobs.complete(project, job, inspections, build);
      if (assistantText.trim()) {
        await appendChatMessage(project, {
          id: `bit-${job.id}`,
          role: "assistant",
          text: assistantText,
          createdAt: this.now().toISOString(),
        });
      }
      return { ok: true, turnId: result.turnId, status: result.status };
    } catch (error) {
      if (project && job) {
        await this.botJobs.jam(
          project,
          job,
          error instanceof Error ? error.message : String(error),
        );
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (job) this.runtime.disposeProject?.(job.id);
      if (project) this.activeRuntimeKeys.delete(project.id);
    }
  }

  async abort(profileId: string, projectId: string): Promise<void> {
    await this.projects.get(profileId, projectId);
    const runtimeKey = this.activeRuntimeKeys.get(projectId) ?? projectId;
    await this.runtime.abort(runtimeKey);
  }
}

function botPrompt(input: {
  leadPrompt: string;
  profile: ProfileSummary;
  project: RuntimeProject;
  projectCatalog: Array<{ id: string; title: string }>;
}): string {
  const projects = input.projectCatalog.map((project) => `- ${project.title}`).join("\n");
  const interests = input.profile.interests.length ? input.profile.interests.join(", ") : "not set";
  const notes = input.profile.notes?.trim() || "None.";
  return `The Lead Builder asked Bit for help.

You are a Bot working for Bit inside an isolated Workbench.
Lead Builder profile:
- Name: ${input.profile.name}
- Age: ${input.profile.age}
- Interests: ${interests}
- Parent notes: ${notes}

Current project: ${input.project.title}

Factory projects:
${projects}

Job:
${input.leadPrompt}

Do the work in this Workbench only. Bit will run Machines and the Assembly Line after you finish.`;
}

async function appendChatMessage(project: RuntimeProject, message: ChatMessage): Promise<void> {
  await appendJsonl(project.projectLogbookPath, {
    timestamp: message.createdAt,
    type: "chat_message",
    projectId: project.id,
    message,
  });
}

async function readChatMessages(project: RuntimeProject): Promise<ChatMessage[]> {
  const entries = await readJsonl<ProjectLogbookEntry>(project.projectLogbookPath);
  return entries.flatMap((entry) => {
    if (!isChatMessageEntry(entry, project.id)) return [];
    return [entry.message];
  });
}

function isChatMessageEntry(
  entry: ProjectLogbookEntry,
  projectId: string,
): entry is Extract<ProjectLogbookEntry, { type: "chat_message" }> {
  return entry.type === "chat_message" && entry.projectId === projectId;
}

async function readSessionMessages(sessionFile: string | undefined): Promise<unknown[]> {
  if (!sessionFile) return [];
  try {
    const raw = await readFile(sessionFile, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line) as { type?: string; message?: unknown };
          return entry.type === "message" && entry.message ? [entry.message] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
