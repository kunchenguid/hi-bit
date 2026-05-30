import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent } from "@shared/chat";
import { describe, expect, it } from "vitest";
import { type BotJobRecord, BotJobService } from "../bots/botJobService";
import type { BotBuild, BotPipeline, BotWorkbench } from "../bots/botPipeline";
import { ConversationService } from "../conversation/conversationService";
import type { BitPromptInput, BitRuntime, BitTurnResult } from "../pi/bitRuntimeService";
import { PreviewService } from "../preview/previewService";
import { ProfileService } from "../profiles/profileService";
import { ProjectService, type RuntimeProject } from "../projects/projectService";
import { readJsonl } from "../storage/json";
import { bootstrapLayout } from "../storage/layout";
import {
  BitCoordinatorService,
  type BotRuntime,
  buildCompletionPrompt,
  extractReadyToPlay,
} from "./bitCoordinatorService";

/** Bot runtime stub: emits ambient tool activity, then a short completion note. */
class FakeBotRuntime implements BotRuntime {
  prompts: Array<{ project: RuntimeProject; text: string }> = [];
  disposed: string[] = [];
  status: "completed" | "cancelled" | "failed" = "completed";
  statuses: Array<"completed" | "cancelled" | "failed"> = [];
  statusByRuntimeKey = new Map<string, "completed" | "cancelled" | "failed">();
  emitsTools = true;
  emitsToolEnd = true;
  completionNote = "Added the thing.";
  beforeReturn?: (project: RuntimeProject) => Promise<void> | void;

  async sendPrompt(project: RuntimeProject, text: string, onEvent: (event: ChatEvent) => void) {
    this.prompts.push({ project, text });
    const meta = {
      profileId: project.profileId,
      projectId: project.id,
      projectTitle: project.title,
      turnId: `bot-${project.runtimeKey}`,
    };
    if (this.emitsTools) {
      onEvent({ type: "tool_start", ...meta, callId: "w1", toolName: "write", args: {} });
      if (this.emitsToolEnd) {
        onEvent({ type: "tool_end", ...meta, callId: "w1", isError: false, content: [] });
      }
    }
    onEvent({ ...meta, type: "assistant_delta", text: this.completionNote });
    await this.beforeReturn?.(project);
    return {
      turnId: meta.turnId,
      status:
        this.statusByRuntimeKey.get(project.runtimeKey ?? "") ??
        this.statuses.shift() ??
        this.status,
    };
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

type BitHandler = (ctx: {
  text: string;
  profileId: string;
  callTool: (name: string, params: unknown) => Promise<unknown>;
}) => Promise<string>;

class FakeBitRuntime implements BitRuntime {
  prompts: string[] = [];
  inputs: BitPromptInput[] = [];
  handler: BitHandler = async () => "";
  failCompletions = false;
  afterStart?: (ctx: { text: string; profileId: string; turnId: string }) => Promise<void> | void;
  private turn = 0;
  private runningSet = new Set<string>();

  async prompt(
    input: BitPromptInput,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<BitTurnResult> {
    this.prompts.push(text);
    this.inputs.push(input);
    if (this.failCompletions && isCompletion(text)) {
      throw new Error("Bit completion failed");
    }
    this.runningSet.add(input.profileId);
    const turnId = `bit-turn-${++this.turn}`;
    onEvent({ type: "turn_start", profileId: input.profileId, turnId });
    await this.afterStart?.({ text, profileId: input.profileId, turnId });
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
      sessionFile: `/tmp/bit/${input.profileId}.jsonl`,
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
  const root = await mkdtemp(join(tmpdir(), "hibit-bit-"));
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
  const bot = new FakeBotRuntime();
  const pipeline = new FakePipeline();
  const bit = new FakeBitRuntime();
  // Preview server with everything that touches a real process faked out.
  const previewSpawns: Array<{ command: string; cwd: string }> = [];
  let previewPort = 4310;
  const preview = new PreviewService({
    resolveWorkbenchDir: (pid, projId) => projects.pathsFor(pid, projId).mainWorkbenchDir,
    spawn: (command, options) => {
      previewSpawns.push({ command, cwd: options.cwd });
      return { pid: undefined, kill: () => true, on: () => {} };
    },
    findFreePort: async () => previewPort++,
    waitForPort: async () => {},
    now,
  });
  let counter = 0;
  const coordinator = new BitCoordinatorService({
    profiles,
    projects,
    conversation,
    bit,
    bot,
    pipeline,
    preview,
    botJobs: new BotJobService({
      now,
      nextBlueprintId: () => `blueprint_${++counter}`,
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
    bot,
    pipeline,
    bit,
    preview,
    previewSpawns,
    profile: ada,
    events,
    drain,
  };
}

function isCompletion(text: string): boolean {
  return text.includes("is ready") || text.includes("hit a snag") || text.includes("was stopped");
}

describe("BitCoordinatorService (Bit)", () => {
  it("replies to chit-chat without creating anything", async () => {
    const s = await createCoordinator();
    s.bit.handler = async () => "Hi Ada! What should we build?";

    const result = await s.coordinator.send(s.profile.id, "hello");
    await s.drain();

    expect(result).toEqual({ ok: true, turnId: "bit-turn-1", status: "completed" });
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
    s.bit.handler = async () => "";

    await s.coordinator.send(s.profile.id, "first");
    await s.coordinator.send(s.profile.id, "second");

    const transcript = await s.conversation.readTranscript(s.profile.id);
    const userIds = transcript
      .filter((message) => message.role === "user")
      .map((message) => message.id);
    expect(new Set(userIds).size).toBe(userIds.length);
  });

  it("records direct Bit file mutations on the affected creation", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Star game" });
    s.bit.handler = async () => "Tweaked the title.";

    await s.coordinator.send(s.profile.id, "make the title blue");
    const mutation = s.bit.inputs[0].onProfileMutation;
    expect(mutation).toBeTypeOf("function");

    await mutation?.({
      projectId: game.id,
      path: `projects/${game.id}/main-workbench/styles.css`,
      tool: "edit",
    });

    const [updated] = await s.projects.list(s.profile.id);
    expect(updated.updatedAt).toBe("2026-01-02T03:04:05.000Z");
    const rows = await readJsonl<Record<string, unknown>>(
      s.projects.pathsFor(s.profile.id, game.id).projectLogbookPath,
    );
    expect(rows).toContainEqual({
      type: "direct_edit",
      projectId: game.id,
      tool: "edit",
      path: `projects/${game.id}/main-workbench/styles.css`,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
  });

  it("confirms a new idea on one turn, then creates and builds it after the kid agrees", async () => {
    const s = await createCoordinator();
    s.bit.handler = async ({ text, callTool }) => {
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
    expect(s.bot.disposed).toEqual(["bot_job_1"]);

    // Completion turn ran and posted a kid-facing update.
    const completionPrompt = s.bit.prompts.find((p) => p.includes("is ready"));
    expect(completionPrompt).toContain("Cat Jump");
    expect(completionPrompt).not.toMatch(/worker|id:/i);
    expect(completionPrompt).not.toContain(portfolio[0]?.id);
  });

  it("refuses to create when the kid has not confirmed", async () => {
    const s = await createCoordinator();
    let toolResult: unknown;
    s.bit.handler = async ({ callTool }) => {
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
    s.bit.handler = async ({ text, callTool }) => {
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
      expect(text).not.toMatch(/worker|bot|bot_job_|\bcreation id\b/i);
      expect(text).not.toContain(game.id);
    }
  });

  it("delegates an edit on an existing creation immediately and surfaces bot activity", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", {
        creationId: game.id,
        instructions: "make the cat orange",
      });
      return "Making the cat orange now!";
    };

    await s.coordinator.send(s.profile.id, "make the cat orange");
    await s.drain();

    expect(s.bot.prompts).toHaveLength(1);
    expect(s.bot.prompts[0]?.text).toContain("make the cat orange");
    expect(s.pipeline.installed).toHaveLength(1);

    const toolEvent = s.events.find((event) => event.type === "tool_start");
    expect(toolEvent).toMatchObject({ projectId: game.id, projectTitle: "Cat Jump" });
  });

  it("asks Bit to start a preview only when the bot marks the build ready to play", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bot.completionNote = "Made the cat jump over boxes. [[READY_TO_PLAY]]";
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "All set!";
      await callTool("delegate_build", { creationId: game.id, instructions: "build it" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "build it");
    await s.drain();

    const completionPrompt = s.bit.prompts.find((p) => p.includes("is ready"));
    expect(completionPrompt).toContain("start_preview");
    expect(completionPrompt).toContain("Play");
    // the internal tag never leaks into the kid-facing summary
    expect(completionPrompt).not.toContain("READY_TO_PLAY");
    expect(completionPrompt).toContain("Made the cat jump over boxes.");
  });

  it("does not ask Bit to start a preview when the bot leaves it unmarked", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bot.completionNote = "Saved a new sprite, still wiring it up.";
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Okay!";
      await callTool("delegate_build", { creationId: game.id, instructions: "step one" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "step one");
    await s.drain();

    const completionPrompt = s.bit.prompts.find((p) => p.includes("is ready"));
    expect(completionPrompt).toBeDefined();
    expect(completionPrompt).not.toContain("start_preview");
  });

  it("touches creation metadata after a successful build install", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    expect(game.updatedAt).toBe("2026-01-02T03:04:05.000Z");
    s.bit.handler = async ({ text, callTool }) => {
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
    s.bit.failCompletions = true;
    s.bit.handler = async ({ text, callTool }) => {
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

  it("returns from send after the ack while the bot keeps building in the background", async () => {
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
    s.bit.handler = async ({ text, callTool }) => {
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

  it("starts a parallel bot per creation for a multi-creation request", async () => {
    const s = await createCoordinator();
    const a = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    const b = await s.projects.create(s.profile.id, { title: "Space Site" });
    s.bit.handler = async ({ text, callTool }) => {
      if (!text.includes("starrier")) return "";
      await callTool("delegate_build", { creationId: a.id, instructions: "add stars" });
      await callTool("delegate_build", { creationId: b.id, instructions: "add stars" });
      return "Adding stars to both!";
    };

    await s.coordinator.send(s.profile.id, "make all my creations starrier");
    await s.drain();

    expect(s.bot.prompts).toHaveLength(2);
    expect(s.pipeline.installed).toHaveLength(2);
    const completions = s.bit.prompts.filter((p) => p.includes("is ready"));
    expect(completions).toHaveLength(2);
    for (const completion of completions) {
      expect(completion).not.toMatch(/worker|id:/i);
    }
  });

  it("reports a bot failure through a gentle completion turn", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bot.status = "failed";
    s.bit.handler = async ({ text, callTool }) => {
      if (text.includes("ready") || text.includes("snag")) return "Hmm, let's try again.";
      await callTool("delegate_build", { creationId: game.id, instructions: "break it" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "change it");
    await s.drain();

    expect(s.pipeline.installed).toHaveLength(0);
    const failurePrompt = s.bit.prompts.find((p) => p.includes("hit a snag"));
    expect(failurePrompt).toContain("Cat Jump");
    expect(failurePrompt).not.toMatch(/worker|id:/i);
    expect(failurePrompt).not.toContain(game.id);
  });

  it("persists bot tool steps and returns them grouped by creation on load", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
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

  it("persists build activity when a bot finishes without tool steps", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bot.emitsTools = false;
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "think quietly" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "think quietly");
    await s.drain();

    await expect(s.coordinator.load(s.profile.id)).resolves.toMatchObject({
      activity: [{ projectId: game.id, title: "Cat Jump", status: "done", steps: [] }],
    });
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
    s.bit.handler = async ({ text, callTool }) => {
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

  it("emits build_start and build_end around a bot build", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
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
    s.bit.handler = async ({ text, callTool }) => {
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

  it("closes persisted running tool steps when a bot build fails before tool_end", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bot.emitsToolEnd = false;
    s.bot.status = "failed";
    s.bit.handler = async ({ text, callTool }) => {
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

  it("emits bot tool activity with the build job turn id", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bot.emitsToolEnd = false;
    s.bot.status = "failed";
    s.bit.handler = async ({ text, callTool }) => {
      if (text.includes("snag")) return "Hmm, let's try again.";
      await callTool("delegate_build", { creationId: game.id, instructions: "break it" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "change it");
    await s.drain();

    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "tool_start", callId: "w1", turnId: "bot_job_1" }),
    );
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "build_end", projectId: game.id, turnId: "bot_job_1" }),
    );
  });

  it("emits a live tool end when an earlier concurrent build closes stale activity", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    let promptsStarted = 0;
    let releaseFirst: (() => void) | undefined;
    const firstCanReturn = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const bothPromptsStarted = new Promise<void>((resolve) => {
      s.bot.beforeReturn = async () => {
        promptsStarted += 1;
        if (promptsStarted === 1) await firstCanReturn;
        if (promptsStarted === 2) resolve();
      };
    });
    let releaseSecondInstall: (() => void) | undefined;
    const secondCanInstall = new Promise<void>((resolve) => {
      releaseSecondInstall = resolve;
    });
    const secondInstallStarted = new Promise<void>((resolve) => {
      s.pipeline.beforeInstall = async () => {
        resolve();
        await secondCanInstall;
      };
    });
    s.bot.emitsToolEnd = false;
    s.bot.statusByRuntimeKey.set("bot_job_1", "failed");
    s.bot.statusByRuntimeKey.set("bot_job_2", "completed");
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Ready!";
      await callTool("delegate_build", { creationId: game.id, instructions: "break it" });
      await callTool("delegate_build", { creationId: game.id, instructions: "fix it" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add two things");
    await bothPromptsStarted;
    releaseFirst?.();
    await secondInstallStarted;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(s.events).toContainEqual(
      expect.objectContaining({
        type: "tool_end",
        projectId: game.id,
        turnId: "bot_job_1",
        callId: "w1",
        isError: true,
      }),
    );
    expect(s.events).not.toContainEqual(
      expect.objectContaining({ type: "build_end", projectId: game.id, turnId: "bot_job_1" }),
    );

    releaseSecondInstall?.();
    await s.drain();
  });

  it("does not report closed activity as active work after waiting for queued writes", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    let releaseAppend: (() => void) | undefined;
    let loadResolved = false;
    const appendStarted = new Promise<void>((resolve) => {
      const appendActivity = s.projects.appendActivity.bind(s.projects);
      s.projects.appendActivity = async (profileId, projectId, value) => {
        if (
          value &&
          typeof value === "object" &&
          "type" in value &&
          value.type === "tool_step" &&
          "status" in value &&
          value.status === "running"
        ) {
          resolve();
          await new Promise<void>((release) => {
            releaseAppend = release;
          });
        }
        return appendActivity(profileId, projectId, value);
      };
    });
    s.bot.emitsToolEnd = false;
    s.bot.status = "failed";
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Hmm, let's try again.";
      await callTool("delegate_build", { creationId: game.id, instructions: "break it" });
      return "On it!";
    };

    const send = s.coordinator.send(s.profile.id, "change it");
    await appendStarted;
    const load = s.coordinator.load(s.profile.id).then((snapshot) => {
      loadResolved = true;
      return snapshot;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadResolved).toBe(false);

    releaseAppend?.();
    await expect(load).resolves.toMatchObject({
      activity: [
        {
          projectId: game.id,
          status: "done",
          steps: [{ callId: "w1", status: "failed" }],
        },
      ],
    });
    await send;
    await s.drain();
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
    await expect(s.projects.readActivity(s.profile.id, game.id)).resolves.toMatchObject([
      { callId: "w1", status: "failed" },
    ]);
  });

  it("orders reloaded activity by latest activity instead of project update time", async () => {
    const s = await createCoordinator();
    const oldGame = await s.projects.create(s.profile.id, { title: "Old Game" });
    const newGame = await s.projects.create(s.profile.id, { title: "New Game" });
    await s.projects.touch(s.profile.id, oldGame.id, "2026-01-01T00:00:00.000Z");
    await s.projects.touch(s.profile.id, newGame.id, "2026-01-03T00:00:00.000Z");
    await s.projects.appendActivity(s.profile.id, oldGame.id, {
      type: "tool_step",
      callId: "w1",
      toolName: "write",
      status: "completed",
    });
    await s.projects.appendActivity(s.profile.id, newGame.id, {
      type: "tool_step",
      callId: "w2",
      toolName: "read",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const snapshot = await s.coordinator.load(s.profile.id);

    expect(snapshot.activity.map((activity) => activity.projectId)).toEqual([
      oldGame.id,
      newGame.id,
    ]);
  });

  it("loads the continuous profile transcript", async () => {
    const s = await createCoordinator();
    s.bit.handler = async () => "Hello!";
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

  it("keeps the transcript even when activity rebuild fails on load", async () => {
    const s = await createCoordinator();
    s.bit.handler = async () => "Hello!";
    await s.coordinator.send(s.profile.id, "hi");
    await s.drain();

    // A logbook hiccup while rebuilding activity must not swallow the chat the
    // kid actually cares about. The transcript is on disk; the load must show it.
    s.projects.list = async () => {
      throw new Error("logbook unreadable");
    };

    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.messages).toMatchObject([
      { role: "user", text: "hi" },
      { role: "assistant", text: "Hello!" },
    ]);
    expect(snapshot.activity).toEqual([]);
  });

  it("starts a preview server, runs the command in the creation workbench, and emits preview_ready", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    let toolResult: unknown;
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      toolResult = await callTool("start_preview", {
        projectId: game.id,
        command: "python3 -m http.server",
      });
      return "Press Play to try it!";
    };

    await s.coordinator.send(s.profile.id, "let me play it");
    await s.drain();

    expect(s.previewSpawns).toMatchObject([
      {
        command: "python3 -m http.server",
        cwd: s.projects.pathsFor(s.profile.id, game.id).mainWorkbenchDir,
      },
    ]);
    expect(s.events).toContainEqual(
      expect.objectContaining({
        type: "preview_ready",
        profileId: s.profile.id,
        projectId: game.id,
        projectTitle: "Snake Game",
        url: "http://127.0.0.1:4310/",
      }),
    );
    expect(toolResult).toMatchObject({
      details: { projectId: game.id, url: "http://127.0.0.1:4310/" },
    });

    // A fresh load surfaces the live preview so Play survives a renderer reload.
    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.previews).toMatchObject([
      { projectId: game.id, title: "Snake Game", url: "http://127.0.0.1:4310/" },
    ]);
    // And the project logbook keeps a durable record of it.
    await expect(s.projects.latestActivityAt(s.profile.id, game.id)).resolves.toBeDefined();

    // The reply that announced the preview is tagged so its bubble can show Play.
    const transcript = await s.conversation.readTranscript(s.profile.id);
    const reply = transcript.find((message) => message.text === "Press Play to try it!");
    expect(reply?.projectId).toBe(game.id);
  });

  it("remembers the preview command so the creation stays playable after a restart", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("start_preview", { projectId: game.id, command: "python3 -m http.server" });
      return "Press Play!";
    };
    await s.coordinator.send(s.profile.id, "play it");
    await s.drain();

    // Simulate an app restart: the in-memory preview process is gone.
    s.preview.stopAll();
    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.previews).toHaveLength(0);
    expect(snapshot.playableProjectIds).toContain(game.id);
  });

  it("plays a remembered creation idempotently, restarting the server on demand", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    await s.projects.rememberPreviewCommand(
      s.profile.id,
      game.id,
      'python3 -m http.server "$PORT"',
    );

    const info = await s.coordinator.playPreview(s.profile.id, game.id);
    expect(info).toMatchObject({ projectId: game.id, title: "Snake Game" });
    expect(s.previewSpawns).toHaveLength(1);
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "preview_ready", projectId: game.id }),
    );

    // Pressing Play again must not spawn a second server.
    await s.coordinator.playPreview(s.profile.id, game.id);
    expect(s.previewSpawns).toHaveLength(1);
  });

  it("recovers a creation previewed before the command was persisted (old data)", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    // Simulate an old build: a preview happened (logbook row) but no command saved.
    await s.projects.recordPreviewServer(s.profile.id, game.id, {
      projectId: game.id,
      title: "Snake Game",
      url: "http://127.0.0.1:51913/",
      startedAt: "2026-05-27T23:46:15.722Z",
    });

    // It is reported playable on load even with no remembered command.
    const snapshot = await s.coordinator.load(s.profile.id);
    expect(snapshot.playableProjectIds).toContain(game.id);

    // Play restarts it using the static default and persists that command.
    const info = await s.coordinator.playPreview(s.profile.id, game.id);
    expect(info.projectId).toBe(game.id);
    expect(s.previewSpawns).toHaveLength(1);
    expect(s.previewSpawns[0].command).toBe('python3 -m http.server "$PORT" --bind 127.0.0.1');
    await expect(s.projects.get(s.profile.id, game.id)).resolves.toMatchObject({
      lastPreviewCommand: 'python3 -m http.server "$PORT" --bind 127.0.0.1',
    });
  });

  it("refuses to play a creation that was never previewed", async () => {
    const s = await createCoordinator();
    const fresh = await s.projects.create(s.profile.id, { title: "Fresh" });
    await expect(s.coordinator.playPreview(s.profile.id, fresh.id)).rejects.toThrow(/no preview/i);
  });

  it("keeps a live preview successful when recording preview history fails", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    s.projects.recordPreviewServer = async () => {
      throw new Error("logbook full");
    };
    let toolResult: unknown;
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      toolResult = await callTool("start_preview", {
        projectId: game.id,
        command: "python3 -m http.server",
      });
      return "Press Play to try it!";
    };

    await s.coordinator.send(s.profile.id, "let me play it");
    await s.drain();

    expect(s.preview.list(s.profile.id)).toMatchObject([
      { projectId: game.id, title: "Snake Game", url: "http://127.0.0.1:4310/" },
    ]);
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "preview_ready", projectId: game.id }),
    );
    expect(toolResult).toMatchObject({
      details: { projectId: game.id, url: "http://127.0.0.1:4310/" },
    });
    await expect(s.projects.get(s.profile.id, game.id)).resolves.toMatchObject({
      lastPreviewCommand: "python3 -m http.server",
    });
  });

  it("remembers a recovered preview command when recording preview history fails", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    await s.projects.recordPreviewServer(s.profile.id, game.id, {
      projectId: game.id,
      title: "Snake Game",
      url: "http://127.0.0.1:51913/",
      startedAt: "2026-05-27T23:46:15.722Z",
    });
    s.projects.recordPreviewServer = async () => {
      throw new Error("logbook full");
    };

    await s.coordinator.playPreview(s.profile.id, game.id);

    await expect(s.projects.get(s.profile.id, game.id)).resolves.toMatchObject({
      lastPreviewCommand: 'python3 -m http.server "$PORT" --bind 127.0.0.1',
    });
  });

  it("lists running previews for the profile", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    let listText = "";
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("start_preview", { projectId: game.id, command: "python3 -m http.server" });
      const result = (await callTool("list_previews", {})) as {
        content: Array<{ text: string }>;
      };
      listText = result.content.map((item) => item.text).join("\n");
      return "Here they are.";
    };

    await s.coordinator.send(s.profile.id, "what's running");
    await s.drain();

    expect(listText).toContain("Snake Game");
    expect(listText).toContain(game.id);
    expect(listText).toContain("http://127.0.0.1:4310/");
  });

  it("stops a preview, emits preview_stopped, and drops it from the snapshot", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Snake Game" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      if (text.includes("stop it")) {
        await callTool("stop_preview", { projectId: game.id });
        return "Closed it.";
      }
      await callTool("start_preview", { projectId: game.id, command: "python3 -m http.server" });
      return "Press Play!";
    };

    await s.coordinator.send(s.profile.id, "play it");
    await s.drain();
    expect(s.preview.list(s.profile.id)).toHaveLength(1);

    await s.coordinator.send(s.profile.id, "stop it");
    await s.drain();

    expect(s.preview.list(s.profile.id)).toEqual([]);
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "preview_stopped", projectId: game.id }),
    );
    await expect(s.coordinator.load(s.profile.id)).resolves.toMatchObject({ previews: [] });
  });

  it("does not stop another profile's preview", async () => {
    const s = await createCoordinator();
    const other = await s.profiles.create({ name: "Sam", age: 10, interests: [], notes: "" });
    const otherGame = await s.projects.create(other.id, { title: "Sam's Game" });
    await s.preview.start(other.id, otherGame.id, "python3 -m http.server", otherGame.title);
    let toolResult: { content: Array<{ text: string }>; details: { stopped: boolean } } | undefined;
    s.bit.handler = async ({ callTool }) => {
      toolResult = (await callTool("stop_preview", {
        projectId: otherGame.id,
      })) as typeof toolResult;
      return "Tried.";
    };

    await s.coordinator.send(s.profile.id, "stop that other game");
    await s.drain();

    expect(s.preview.list(other.id)).toHaveLength(1);
    expect(toolResult?.details.stopped).toBe(false);
    expect(toolResult?.content[0]?.text).toBe("That preview was not running.");
    expect(s.events).not.toContainEqual(
      expect.objectContaining({ type: "preview_stopped", projectId: otherGame.id }),
    );
  });

  it("emits bot_result lifecycle events around the completion turn, reply ones for the kid's turn", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Cat Jump is ready! 🎉";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    // The kid's own turn is a plain reply so the composer locks as usual.
    expect(s.events).toContainEqual(expect.objectContaining({ type: "turn_start", kind: "reply" }));
    expect(s.events).toContainEqual(expect.objectContaining({ type: "turn_end", kind: "reply" }));
    // The bot-completion turn is tagged so the renderer can word "Bit is
    // checking the bot's work" and avoid hijacking the composer.
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "turn_start", kind: "bot_result" }),
    );
    expect(s.events).toContainEqual(
      expect.objectContaining({ type: "turn_end", kind: "bot_result" }),
    );
  });

  it("reports an active bot-result turn in the loaded snapshot", async () => {
    const s = await createCoordinator();
    const snapshots: Array<Awaited<ReturnType<typeof s.coordinator.load>>> = [];
    s.bit.afterStart = async ({ text }) => {
      if (isCompletion(text)) {
        snapshots.push(await s.coordinator.load(s.profile.id));
      }
    };
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Cat Jump is ready.";
      await callTool("create_creation", {
        title: "Cat Jump",
        instructions: "make a cat game",
        confirmed: true,
      });
      return "A bot is building Cat Jump.";
    };

    await s.coordinator.send(s.profile.id, "make a cat game");
    await s.drain();

    expect(snapshots[0]?.activeTurn).toEqual({ id: "bit-turn-2", kind: "bot_result" });
    expect(snapshots[0]?.isRunning).toBe(true);
  });

  it("tags the completion message with its creation so the renderer can light up Play", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Cat Jump is ready! 🎉";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    const transcript = await s.conversation.readTranscript(s.profile.id);
    const ready = transcript.find((message) => message.text.includes("is ready"));
    expect(ready?.projectId).toBe(game.id);
  });

  it("gates Bit to the base words before anything is unlocked", async () => {
    const s = await createCoordinator();
    s.bit.handler = async () => "Hi Ada!";

    await s.coordinator.send(s.profile.id, "hello");
    await s.drain();

    const prompt = s.bit.prompts.at(-1);
    expect(prompt).toContain("Words you may use: Bit, build, creation, Play.");
    expect(prompt).not.toMatch(/newly unlocked/i);
    expect(prompt).not.toMatch(/\bbot\b/i);
  });

  it("unlocks and reveals the word 'bot' on the kid's first finished build", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "All done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    // The kid's own turn started before any build, so it stays on base words.
    const replyPrompt = s.bit.prompts.find((p) => p.includes("add stars"));
    expect(replyPrompt).toContain("Words you may use: Bit, build, creation, Play.");

    // The completion turn is the moment the build became real - "bot" unlocks here.
    const completionPrompt = s.bit.prompts.find((p) => p.includes("is ready"));
    expect(completionPrompt).toMatch(/newly unlocked/i);
    expect(completionPrompt).toContain('"bot"');

    const profile = await s.profiles.get(s.profile.id);
    expect(profile.unlockedConcepts.map((concept) => concept.id)).toContain("bot");
    expect(profile.unlockStats.buildsDelegated).toBe(1);
  });

  it("emits profile_updated only after persisting a revealed word", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "All done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    const turnEndIndex = s.events.findIndex(
      (event) => event.type === "turn_end" && event.kind === "bot_result",
    );
    const profileUpdatedIndex = s.events.findIndex((event) => event.type === "profile_updated");
    expect(turnEndIndex).toBeGreaterThanOrEqual(0);
    expect(profileUpdatedIndex).toBeGreaterThan(turnEndIndex);
  });

  it("does not unlock the bot word while the first build is still running", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    let finishBuild!: () => void;
    const buildPaused = new Promise<void>((resolve) => {
      finishBuild = resolve;
    });
    s.pipeline.beforeInstall = async () => buildPaused;
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "All done!";
      if (text.includes("add stars")) {
        await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      }
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.coordinator.send(s.profile.id, "can I keep chatting?");
    finishBuild();
    await s.drain();

    const midBuildPrompt = s.bit.prompts.find((p) => p.includes("can I keep chatting?"));
    expect(midBuildPrompt).toContain("Words you may use: Bit, build, creation, Play.");
    expect(midBuildPrompt).not.toMatch(/newly unlocked/i);

    const completionPrompt = s.bit.prompts.find((p) => p.includes("is ready"));
    expect(completionPrompt).toMatch(/newly unlocked/i);
    expect(completionPrompt).toContain('"bot"');
  });

  it("does not persist a new word when the reveal turn fails", async () => {
    const s = await createCoordinator();
    const game = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    s.bit.failCompletions = true;
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "All done!";
      await callTool("delegate_build", { creationId: game.id, instructions: "add stars" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "add stars");
    await s.drain();

    const profile = await s.profiles.get(s.profile.id);
    expect(profile.unlockStats.buildsDelegated).toBe(1);
    expect(profile.unlockedConcepts.map((concept) => concept.id)).not.toContain("bot");
  });

  it("reveals at most one new word per turn", async () => {
    const s = await createCoordinator();
    // Two creations plus several builds make bot, workshop, blueprint, machines
    // all eligible at once, but each turn may surface only one.
    const a = await s.projects.create(s.profile.id, { title: "Cat Jump" });
    const b = await s.projects.create(s.profile.id, { title: "Space Site" });
    s.bit.handler = async ({ text, callTool }) => {
      if (isCompletion(text)) return "Done!";
      await callTool("delegate_build", { creationId: a.id, instructions: "x" });
      await callTool("delegate_build", { creationId: b.id, instructions: "y" });
      await callTool("delegate_build", { creationId: a.id, instructions: "z" });
      return "On it!";
    };

    await s.coordinator.send(s.profile.id, "build lots");
    await s.drain();

    for (const prompt of s.bit.prompts) {
      const reveals = prompt.match(/newly unlocked/gi) ?? [];
      expect(reveals.length).toBeLessThanOrEqual(1);
    }
  });

  it("unlocks the Logbook word after the kid opens the activities view", async () => {
    const s = await createCoordinator();
    await s.coordinator.markActivitiesOpened(s.profile.id);
    s.bit.handler = async () => "Sure!";

    await s.coordinator.send(s.profile.id, "what did we do?");
    await s.drain();

    const prompt = s.bit.prompts.at(-1);
    expect(prompt).toContain("Logbook");
    expect(prompt).toMatch(/newly unlocked/i);

    const profile = await s.profiles.get(s.profile.id);
    expect(profile.unlockedConcepts.map((concept) => concept.id)).toContain("logbook");
  });
});

describe("extractReadyToPlay", () => {
  it("detects the tag and strips it from the summary", () => {
    expect(extractReadyToPlay("Made a robot that walks.\n[[READY_TO_PLAY]]")).toEqual({
      readyToPlay: true,
      summary: "Made a robot that walks.",
    });
  });

  it("is false and leaves the summary intact when the tag is absent", () => {
    expect(extractReadyToPlay("Saved a sprite, more to do.")).toEqual({
      readyToPlay: false,
      summary: "Saved a sprite, more to do.",
    });
  });

  it("tolerates spacing and case in the tag", () => {
    expect(extractReadyToPlay("done [[ ready_to_play ]]").readyToPlay).toBe(true);
  });
});

describe("buildCompletionPrompt", () => {
  const base = { title: "Robot Run", summary: "Built it." };

  it("asks Bit to start a preview only when ready and completed", () => {
    const ready = buildCompletionPrompt({
      ...base,
      outcome: "completed",
      projectId: "project_robot_run",
      readyToPlay: true,
    });
    expect(ready).toContain("start_preview");
    expect(ready).toContain("project_robot_run");
    expect(ready).toContain("correct preview command");
    expect(ready).not.toContain('python3 -m http.server "$PORT" --bind 127.0.0.1');
    expect(ready).toContain("Play");
    expect(ready).toContain("is ready");
  });

  it("just announces readiness when completed but not marked playable", () => {
    const notReady = buildCompletionPrompt({
      ...base,
      outcome: "completed",
      projectId: "project_robot_run",
      readyToPlay: false,
    });
    expect(notReady).toContain("is ready");
    expect(notReady).not.toContain("start_preview");
  });

  it("never starts a preview for cancelled or failed builds", () => {
    expect(
      buildCompletionPrompt({
        ...base,
        outcome: "cancelled",
        projectId: "project_robot_run",
        readyToPlay: true,
      }),
    ).not.toContain("start_preview");
    expect(
      buildCompletionPrompt({
        ...base,
        outcome: "failed",
        projectId: "project_robot_run",
        readyToPlay: true,
      }),
    ).not.toContain("start_preview");
  });
});
