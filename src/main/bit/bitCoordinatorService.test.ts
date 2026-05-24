import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent } from "@shared/chat";
import { describe, expect, it } from "vitest";
import { type BotJobRecord, BotJobService } from "../bots/botJobService";
import type { BotBuild, BotPipeline, BotWorkbench } from "../bots/botPipeline";
import { ConversationService } from "../conversation/conversationService";
import type { MayorPromptInput, MayorRuntime, MayorTurnResult } from "../pi/mayorRuntimeService";
import { ProfileService } from "../profiles/profileService";
import { ProjectService, type RuntimeProject } from "../projects/projectService";
import { bootstrapLayout } from "../storage/layout";
import { BitCoordinatorService, type BitRuntime } from "./bitCoordinatorService";

/** Worker runtime stub: emits ambient tool activity, then a short completion note. */
class FakeWorkerRuntime implements BitRuntime {
  prompts: Array<{ project: RuntimeProject; text: string }> = [];
  disposed: string[] = [];
  status: "completed" | "cancelled" | "failed" = "completed";
  emitsToolEnd = true;

  async sendPrompt(project: RuntimeProject, text: string, onEvent: (event: ChatEvent) => void) {
    this.prompts.push({ project, text });
    const meta = {
      profileId: project.profileId,
      projectId: project.id,
      projectTitle: project.title,
      turnId: `worker-${project.runtimeKey}`,
    };
    onEvent({ type: "tool_start", ...meta, callId: "w1", toolName: "write", args: {} });
    if (this.emitsToolEnd) {
      onEvent({ type: "tool_end", ...meta, callId: "w1", isError: false, content: [] });
    }
    onEvent({ ...meta, type: "assistant_delta", text: "Added the thing." });
    return { turnId: meta.turnId, status: this.status };
  }

  async abort(): Promise<void> {}
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
  installed: Array<{ project: RuntimeProject; job: BotJobRecord }> = [];
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

  async runMachines() {
    return [{ name: "preview_machine", status: "passed" as const }];
  }

  async installBotBuild(project: RuntimeProject, job: BotJobRecord): Promise<BotBuild> {
    await this.beforeInstall?.();
    this.installed.push({ project, job });
    return { jobId: job.id, status: "installed", installedAt: "2026-01-02T03:04:10.000Z" };
  }
}

type MayorHandler = (ctx: {
  text: string;
  profileId: string;
  callTool: (name: string, params: unknown) => Promise<unknown>;
}) => Promise<string>;

class FakeMayorRuntime implements MayorRuntime {
  prompts: string[] = [];
  handler: MayorHandler = async () => "";
  failCompletions = false;
  private turn = 0;
  private runningSet = new Set<string>();

  async prompt(
    input: MayorPromptInput,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<MayorTurnResult> {
    this.prompts.push(text);
    if (this.failCompletions && isCompletion(text)) {
      throw new Error("Mayor completion failed");
    }
    this.runningSet.add(input.profileId);
    const turnId = `mayor-turn-${++this.turn}`;
    onEvent({ type: "turn_start", profileId: input.profileId, turnId });
    const callTool = async (name: string, params: unknown) => {
      const tool = input.customTools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`tool not registered: ${name}`);
      return tool.execute(`${name}-call`, params as never, undefined, undefined, {} as never);
    };
    let assistantText = "";
    try {
      assistantText = await this.handler({ text, profileId: input.profileId, callTool });
      if (assistantText) {
        onEvent({
          type: "assistant_delta",
          profileId: input.profileId,
          turnId,
          text: assistantText,
        });
      }
    } finally {
      this.runningSet.delete(input.profileId);
    }
    onEvent({ type: "turn_end", profileId: input.profileId, turnId, status: "completed" });
    return {
      turnId,
      status: "completed",
      assistantText,
      sessionFile: `/tmp/mayor/${input.profileId}.jsonl`,
    };
  }

  async abort(): Promise<void> {}
  isRunning(profileId: string): boolean {
    return this.runningSet.has(profileId);
  }
  dispose(): void {}
  disposeAll(): void {}
}

async function createCoordinator() {
  const root = await mkdtemp(join(tmpdir(), "hibit-mayor-"));
  const layout = await bootstrapLayout(root);
  const now = () => new Date("2026-01-02T03:04:10.000Z");
  const profiles = new ProfileService(layout, () => new Date("2026-01-02T03:04:04.000Z"));
  const ada = await profiles.create({
    name: "Ada",
    age: 9,
    interests: ["space", "cats"],
    notes: "Gets frustrated fast.",
  });
  const projects = new ProjectService(layout, () => new Date("2026-01-02T03:04:05.000Z"));
  const conversation = new ConversationService(layout, now);
  const worker = new FakeWorkerRuntime();
  const pipeline = new FakePipeline();
  const mayor = new FakeMayorRuntime();
  let counter = 0;
  const coordinator = new BitCoordinatorService({
    profiles,
    projects,
    conversation,
    mayor,
    worker,
    pipeline,
    botJobs: new BotJobService({
      now,
      nextBuildPlanId: () => `build_plan_${++counter}`,
      nextJobId: () => `bot_job_${counter}`,
    }),
    now,
  });
  const events: ChatEvent[] = [];
  coordinator.subscribe((event) => events.push(event));
  async function drain() {
    await Promise.all([...coordinator.pending]);
  }
  return {
    coordinator,
    profiles,
    projects,
    conversation,
    worker,
    pipeline,
    mayor,
    profile: ada,
    events,
    drain,
  };
}

function isCompletion(text: string): boolean {
  return text.includes("is ready") || text.includes("hit a snag") || text.includes("was stopped");
}

describe("BitCoordinatorService (Mayor)", () => {
  it("replies to chit-chat without creating anything", async () => {
    const s = await createCoordinator();
    s.mayor.handler = async () => "Hi Ada! What should we build?";

    const result = await s.coordinator.send(s.profile.id, "hello");
    await s.drain();

    expect(result).toEqual({ ok: true, turnId: "mayor-turn-1", status: "completed" });
    await expect(s.projects.list(s.profile.id)).resolves.toEqual([]);
    expect(s.pipeline.prepared).toHaveLength(0);
    const transcript = await s.conversation.readTranscript(s.profile.id);
    expect(transcript).toMatchObject([
      { role: "user", text: "hello" },
      { role: "assistant", text: "Hi Ada! What should we build?" },
    ]);
  });

  it("persists unique user message ids for rapid sends", async () => {
    const s = await createCoordinator();
    s.mayor.handler = async () => "";

    await s.coordinator.send(s.profile.id, "first");
    await s.coordinator.send(s.profile.id, "second");

    const transcript = await s.conversation.readTranscript(s.profile.id);
    const userIds = transcript
      .filter((message) => message.role === "user")
      .map((message) => message.id);
    expect(new Set(userIds).size).toBe(userIds.length);
  });

  it("confirms a new idea on one turn, then creates and builds it after the kid agrees", async () => {
    const s = await createCoordinator();
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return `Your Cat Jump is ready! 🎉`;
      if (text.includes("make a cat game")) {
        return "Ooh, a cat game! Want me to start it? 🐱";
      }
      await callTool("create_creation", {
        title: "Cat Jump",
        instructions: "build a game where a cat jumps boxes",
        confirmed: true,
      });
      return "On it! Building Cat Jump now.";
    };

    await s.coordinator.send(s.profile.id, "make a cat game");
    expect(await s.projects.list(s.profile.id)).toHaveLength(0); // proposal only, nothing made

    await s.coordinator.send(s.profile.id, "yes please");
    await s.drain();

    const portfolio = await s.projects.list(s.profile.id);
    expect(portfolio).toHaveLength(1);
    expect(portfolio[0]?.title).toBe("Cat Jump");
    expect(s.pipeline.prepared).toHaveLength(1);
    expect(s.pipeline.installed).toHaveLength(1);
    expect(s.worker.disposed).toEqual(["bot_job_1"]);

    // Completion turn ran and posted a kid-facing update.
    const completionPrompt = s.mayor.prompts.find((p) => p.includes("is ready"));
    expect(completionPrompt).toContain("Cat Jump");
    expect(completionPrompt).not.toMatch(/worker|id:/i);
    expect(completionPrompt).not.toContain(portfolio[0]?.id);
  });

  it("refuses to create when the kid has not confirmed", async () => {
    const s = await createCoordinator();
    let toolResult: unknown;
    s.mayor.handler = async ({ callTool }) => {
      toolResult = await callTool("create_creation", {
        title: "Cat Jump",
        instructions: "build it",
        confirmed: false,
      });
      return "Want me to start it?";
    };

    await s.coordinator.send(s.profile.id, "make a cat game");
    await s.drain();

    expect(await s.projects.list(s.profile.id)).toHaveLength(0);
    expect(s.pipeline.prepared).toHaveLength(0);
    expect(toolResult).toMatchObject({ details: { created: false } });
  });

  it("keeps internal build ids out of model-visible tool content", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    const toolResults: unknown[] = [];
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      toolResults.push(
        await callTool("create_creation", {
          title: "Space Garden",
          instructions: "build it",
          confirmed: true,
        }),
      );
      toolResults.push(
        await callTool("delegate_build", {
          creationId: game.id,
          instructions: "add stars",
        }),
      );
      return "I started those builds.";
    };

    await s.coordinator.send(s.profile.id, "build space stuff");
    await s.drain();

    expect(toolResults).toHaveLength(2);
    for (const result of toolResults) {
      expect(result).toMatchObject({ details: { jobId: expect.stringMatching(/^bot_job_/) } });
      const text = (result as { content: Array<{ text: string }> }).content
        .map((item) => item.text)
        .join("\n");
      expect(text).not.toMatch(/Worker|bot_job_|\bcreation id\b/i);
      expect(text).not.toContain(game.id);
    }
  });

  it("delegates an edit on an existing creation immediately and surfaces worker activity", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", {
        creationId: game.id,
        instructions: "make the cat orange",
      });
      return "Making the cat orange now!";
    };

    await s.coordinator.send(s.profile.id, "make the cat orange");
    await s.drain();

    expect(s.worker.prompts).toHaveLength(1);
    expect(s.worker.prompts[0]?.text).toContain("make the cat orange");
    expect(s.pipeline.installed).toHaveLength(1);

    const toolEvent = s.events.find((event) => event.type === "tool_start");
    expect(toolEvent).toMatchObject({ projectId: game.id, projectTitle: "Cat Jump" });
  });

  it("touches creation metadata after a successful build install", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    expect(game.updatedAt).toBe("2026-01-02T03:04:05.000Z");
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    await expect(s.projects.get(s.profile.id, game.id)).resolves.toMatchObject({
      updatedAt: "2026-01-02T03:04:10.000Z",
    });
  });

  it("persists a fallback message when the completion turn fails", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.mayor.failCompletions = true;
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    await expect(s.conversation.readTranscript(s.profile.id)).resolves.toMatchObject([
      { role: "user", text: "add stars" },
      { role: "assistant", text: "On it!" },
      { role: "assistant", text: "Cat Jump is ready." },
    ]);
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "assistant_delta", text: "Cat Jump is ready." }),
    );
  });

  it("returns from send after the ack while the worker keeps building in the background", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    let releaseInstall!: () => void;
    const installStarted = new Promise<void>((resolve) => {
      s.pipeline.beforeInstall = () =>
        new Promise<void>((release) => {
          releaseInstall = release;
          resolve();
        });
    });
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Ready!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    const result = await s.coordinator.send(s.profile.id, "add stars");
    await installStarted;

    expect(result.ok).toBe(true);
    expect(s.pipeline.installed).toHaveLength(0); // build still running after send returned

    releaseInstall();
    await s.drain();
    expect(s.pipeline.installed).toHaveLength(1);
  });

  it("starts a parallel worker per creation for a multi-creation request", async () => {
    const s = await createCoordinator();
    const a = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    const b = await s.projects.create(s.profile.id, { title: "Space Site" });
    s.mayor.handler = async ({ text, callTool }) => {
      if (!text.includes("starrier")) return "";
      await callTool("delegate_build", { creationId: a.id, instructions: "add stars" });
      await callTool("delegate_build", { creationId: b.id, instructions: "add stars" });
      return "Adding stars to both!";
    };

    await s.coordinator.send(s.profile.id, "make all my creations starrier");
    await s.drain();

    expect(s.worker.prompts).toHaveLength(2);
    expect(s.pipeline.installed).toHaveLength(2);
    const completions = s.mayor.prompts.filter((p) => p.includes("is ready"));
    expect(completions).toHaveLength(2);
    for (const completion of completions) {
      expect(completion).not.toMatch(/worker|id:/i);
    }
  });

  it("reports a worker failure through a gentle completion turn", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.worker.status = "failed";
    s.mayor.handler = async ({ text, callTool }) => {
      if (text.includes("ready") || text.includes("snag")) return "Hmm, let's try again.";
      await callTool("delegate_build", { creationId: game.id, instructions: "break it" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "change it");
    await s.drain();

    expect(s.pipeline.installed).toHaveLength(0);
    const failurePrompt = s.mayor.prompts.find((p) => p.includes("hit a snag"));
    expect(failurePrompt).toContain("Cat Jump");
    expect(failurePrompt).not.toMatch(/worker|id:/i);
    expect(failurePrompt).not.toContain(game.id);
  });

  it("persists worker tool steps and returns them grouped by creation on load", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    // A fresh coordinator load (mimicking a renderer reload) rebuilds activity from disk.
    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.activity).toMatchObject([
      {
        projectId: game.id,
        title: "Cat Jump",
        status: "done",
        steps: [{ callId: "w1", toolName: "write", status: "completed" }],
      },
    ]);
  });

  it("marks a creation as working while its build is still in flight", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    let releaseInstall!: () => void;
    const installStarted = new Promise<void>((resolve) => {
      s.pipeline.beforeInstall = () =>
        new Promise<void>((release) => {
          releaseInstall = release;
          resolve();
        });
    });
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Ready!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await installStarted;

    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.activity).toMatchObject([{ projectId: game.id, status: "working" }]);

    releaseInstall();
    await s.drain();
  });

  it("emits build_start and build_end around a worker build", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    expect(s.events).toContainEqual(
      expect.objectContaining({
        type: "build_start",
        projectId: game.id,
        projectTitle: "Cat Jump",
      }),
    );
    expect(s.events).toContainEqual(
      expect.objectContaining({
        type: "build_end",
        projectId: game.id,
        status: "completed",
      }),
    );
  });

  it("keeps grouped activity working until every build for a creation finishes", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    const releases: Array<() => void> = [];
    let installCount = 0;
    let resolveBothInstalls!: () => void;
    const bothInstallsStarted = new Promise<void>((resolve) => {
      resolveBothInstalls = resolve;
    });
    s.pipeline.beforeInstall = () =>
      new Promise<void>((release) => {
        releases.push(release);
        installCount += 1;
        if (installCount === 2) resolveBothInstalls();
      });
    s.mayor.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Ready!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      await callTool("delegate_build", { creationId: game.id, instructions: "add badges" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add two things");
    await bothInstallsStarted;

    releases[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(s.events).not.toContainEqual(
      expect.objectContaining({ type: "build_end", projectId: game.id }),
    );
    await expect(s.coordinator.load(s.profile.id)).resolves.toMatchObject({
      activity: [{ projectId: game.id, status: "working" }],
    });

    releases[1]?.();
    await s.drain();
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "build_end", projectId: game.id, status: "completed" }),
    );
  });

  it("closes persisted running tool steps when a worker build fails before tool_end", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.worker.emitsToolEnd = false;
    s.worker.status = "failed";
    s.mayor.handler = async ({ text, callTool }) => {
      if (text.includes("snag")) return "Hmm, let's try again.";
      await callTool("delegate_build", { creationId: game.id, instructions: "break it" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "change it");
    await s.drain();

    await expect(s.projects.readActivity(s.profile.id, game.id)).resolves.toMatchObject([
      { callId: "w1", toolName: "write", status: "failed" },
    ]);
    await expect(s.coordinator.load(s.profile.id)).resolves.toMatchObject({
      activity: [{ projectId: game.id, status: "done" }],
    });
  });

  it("does not treat orphaned persisted running tool steps as active work on load", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    await s.projects.appendActivity(s.profile.id, game.id, {
      type: "tool_step",
      callId: "w1",
      toolName: "write",
      status: "running",
    });

    await expect(s.coordinator.load(s.profile.id)).resolves.toMatchObject({
      activity: [{ projectId: game.id, status: "done" }],
    });
  });

  it("loads the continuous profile transcript", async () => {
    const s = await createCoordinator();
    s.mayor.handler = async () => "Hello!";
    await s.coordinator.send(s.profile.id, "hi");
    await s.drain();

    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.profileId).toBe(s.profile.id);
    expect(snapshot.isRunning).toBe(false);
    expect(snapshot.messages).toMatchObject([
      { role: "user", text: "hi" },
      { role: "assistant", text: "Hello!" },
    ]);
  });
});
