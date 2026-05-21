import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent } from "@shared/chat";
import { describe, expect, it } from "vitest";
import { type BotJobRecord, BotJobService } from "../bots/botJobService";
import type { BotBuild, BotPipeline, BotWorkbench } from "../bots/botPipeline";
import { ProfileService } from "../profiles/profileService";
import { ProjectService, type RuntimeProject } from "../projects/projectService";
import { bootstrapLayout } from "../storage/layout";
import { BitCoordinatorService, type BitRuntime } from "./bitCoordinatorService";

class FakeRuntime implements BitRuntime {
  prompts: string[] = [];
  projects: RuntimeProject[] = [];
  aborts: string[] = [];
  disposed: string[] = [];
  status: "completed" | "cancelled" | "failed" = "completed";

  async sendPrompt(project: RuntimeProject, text: string, onEvent: (event: ChatEvent) => void) {
    this.projects.push(project);
    this.prompts.push(text);
    onEvent({ type: "turn_start", projectId: project.id, turnId: "turn-1" });
    onEvent({ type: "assistant_delta", projectId: project.id, turnId: "turn-1", text: "Done" });
    onEvent({ type: "turn_end", projectId: project.id, turnId: "turn-1", status: this.status });
    return {
      turnId: "turn-1",
      status: this.status,
      sessionFile: join(project.botSessionsDir, "job_test.jsonl"),
    };
  }

  async abort(runtimeKey: string): Promise<void> {
    this.aborts.push(runtimeKey);
  }

  getMessages(): unknown[] {
    return [];
  }

  isRunning(): boolean {
    return false;
  }

  disposeProject(runtimeKey: string): void {
    this.disposed.push(runtimeKey);
  }
}

class FakePipeline implements BotPipeline {
  prepared: Array<{ project: RuntimeProject; job: BotJobRecord }> = [];
  installed: Array<{ project: RuntimeProject; job: BotJobRecord; workbench: BotWorkbench }> = [];
  beforeInstall?: () => Promise<void> | void;

  async prepareBotWorkbench(project: RuntimeProject, job: BotJobRecord): Promise<BotWorkbench> {
    this.prepared.push({ project, job });
    return {
      kind: "git-worktree",
      jobId: job.id,
      path: join(project.workbenchesDir, job.id),
      branchName: `bot/${job.id}`,
    };
  }

  async runMachines(): Promise<Array<{ name: string; status: "passed" }>> {
    return [{ name: "preview_machine", status: "passed" }];
  }

  async installBotBuild(
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: BotWorkbench,
  ): Promise<BotBuild> {
    await this.beforeInstall?.();
    this.installed.push({ project, job, workbench });
    return {
      jobId: job.id,
      status: "installed",
      installedAt: "2026-01-02T03:04:10.000Z",
    };
  }
}

async function createCoordinator() {
  const root = await mkdtemp(join(tmpdir(), "hibit-bit-"));
  const layout = await bootstrapLayout(root);
  const profiles = new ProfileService(layout, () => new Date("2026-01-02T03:04:04.000Z"));
  const ada = await profiles.create({
    name: "Ada",
    age: 9,
    interests: ["space", "cats"],
    notes: "Gets frustrated fast.",
  });
  const projects = new ProjectService(layout, () => new Date("2026-01-02T03:04:05.000Z"));
  const runtime = new FakeRuntime();
  const pipeline = new FakePipeline();
  const coordinator = new BitCoordinatorService({
    profiles,
    projects,
    botJobs: new BotJobService({
      now: () => new Date("2026-01-02T03:04:10.000Z"),
      nextBuildPlanId: () => "build_plan_0001",
      nextJobId: () => "bot_job_0001",
    }),
    runtime,
    pipeline,
    now: () => new Date("2026-01-02T03:04:10.000Z"),
  });
  const game = await projects.create(ada.id, { title: "Factory game" });
  const site = await projects.create(ada.id, { title: "Space site" });
  return { coordinator, profiles, projects, runtime, pipeline, profile: ada, game, site };
}

describe("BitCoordinatorService", () => {
  it("turns a lead builder message into a build plan, bot job, workbench run, inspections, and install", async () => {
    const setup = await createCoordinator();
    const events: ChatEvent[] = [];

    await expect(
      setup.coordinator.send(setup.profile.id, setup.game.id, "Add star pets", (event) =>
        events.push(event),
      ),
    ).resolves.toEqual({
      ok: true,
      turnId: "turn-1",
      status: "completed",
    });

    expect(events.map((event) => event.type)).toEqual([
      "turn_start",
      "assistant_delta",
      "turn_end",
    ]);
    expect(setup.pipeline.prepared).toHaveLength(1);
    expect(setup.pipeline.installed).toHaveLength(1);
    expect(setup.runtime.projects[0]).toMatchObject({
      id: setup.game.id,
      mainWorkbenchDir: join(
        setup.projects.pathsFor(setup.profile.id, setup.game.id).workbenchesDir,
        "bot_job_0001",
      ),
      runtimeKey: "bot_job_0001",
    });
    expect(setup.runtime.prompts[0]).toContain("The Lead Builder asked Bit");
    expect(setup.runtime.prompts[0]).toContain("Lead Builder profile:");
    expect(setup.runtime.prompts[0]).toContain("- Name: Ada");
    expect(setup.runtime.prompts[0]).toContain("- Age: 9");
    expect(setup.runtime.prompts[0]).toContain("- Interests: space, cats");
    expect(setup.runtime.prompts[0]).toContain("- Parent notes: Gets frustrated fast.");
    expect(setup.runtime.prompts[0]).toContain("Factory projects:");
    expect(setup.runtime.prompts[0]).toContain("- Factory game");
    expect(setup.runtime.prompts[0]).toContain("- Space site");

    const paths = setup.projects.pathsFor(setup.profile.id, setup.game.id);
    const planFiles = await readdir(paths.buildPlansDir);
    const jobFiles = await readdir(paths.botJobsDir);
    expect(planFiles).toEqual(["build_plan_0001.json"]);
    expect(jobFiles).toEqual(["bot_job_0001.json"]);

    const job = JSON.parse(await readFile(join(paths.botJobsDir, "bot_job_0001.json"), "utf8"));
    expect(job).toMatchObject({
      schemaVersion: 1,
      id: "bot_job_0001",
      buildPlanId: "build_plan_0001",
      status: "completed",
      workbench: {
        kind: "git-worktree",
        path: join(paths.workbenchesDir, "bot_job_0001"),
      },
      inspections: [{ name: "preview_machine", status: "passed" }],
      build: { status: "installed" },
    });

    await expect(setup.coordinator.load(setup.profile.id, setup.game.id)).resolves.toMatchObject({
      projectId: setup.game.id,
      messages: [
        { role: "user", text: "Add star pets" },
        { role: "assistant", text: "Done" },
      ],
    });
  }, 15_000);

  it("does not run machines or the assembly line when a bot job is cancelled", async () => {
    const setup = await createCoordinator();
    setup.runtime.status = "cancelled";

    await expect(
      setup.coordinator.send(setup.profile.id, setup.game.id, "Stop building", () => {}),
    ).resolves.toEqual({
      ok: true,
      turnId: "turn-1",
      status: "cancelled",
    });

    expect(setup.pipeline.installed).toHaveLength(0);

    const paths = setup.projects.pathsFor(setup.profile.id, setup.game.id);
    const job = JSON.parse(await readFile(join(paths.botJobsDir, "bot_job_0001.json"), "utf8"));
    expect(job).toMatchObject({
      id: "bot_job_0001",
      status: "cancelled",
    });
  });

  it("rejects a second prompt while a completed runtime turn is still installing", async () => {
    const setup = await createCoordinator();
    let releaseInstall!: () => void;
    let installCalls = 0;
    const installStarted = new Promise<void>((resolve) => {
      setup.pipeline.beforeInstall = () =>
        installCalls++ === 0
          ? new Promise<void>((release) => {
              releaseInstall = release;
              resolve();
            })
          : undefined;
    });

    const first = setup.coordinator.send(
      setup.profile.id,
      setup.game.id,
      "Add star pets",
      () => {},
    );
    await installStarted;

    await expect(
      setup.coordinator.send(setup.profile.id, setup.game.id, "Add moon pets", () => {}),
    ).resolves.toEqual({
      ok: false,
      error: "Bit is already working on this project.",
    });

    releaseInstall();
    await first;
    expect(setup.pipeline.prepared).toHaveLength(1);
  });

  it("disposes the one-off bot runtime after the bot job finishes", async () => {
    const setup = await createCoordinator();

    await setup.coordinator.send(setup.profile.id, setup.game.id, "Add star pets", () => {});

    expect(setup.runtime.disposed).toEqual(["bot_job_0001"]);
  });
});
