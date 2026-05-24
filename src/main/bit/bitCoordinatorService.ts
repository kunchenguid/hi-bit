import { randomUUID } from "node:crypto";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ChatEvent, ChatMessage, ChatSnapshot, SendMessageResult } from "@shared/chat";
import type { ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { Type } from "typebox";
import { type BotJobRecord, BotJobService } from "../bots/botJobService";
import { type BotPipeline, LocalBotPipeline } from "../bots/botPipeline";
import type { ConversationService } from "../conversation/conversationService";
import type { MayorRuntime } from "../pi/mayorRuntimeService";
import type { ProjectService, RuntimeProject } from "../projects/projectService";

/** Worker runtime: runs a build for one creation in its isolated workbench. */
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
  conversation: ConversationService;
  mayor: MayorRuntime;
  worker: BitRuntime;
  botJobs?: BotJobService;
  pipeline?: BotPipeline;
  now?: () => Date;
};

type InflightWorker = {
  jobId: string;
  projectId: string;
  title: string;
  instructions: string;
  startedAt: string;
};

type CreateDetails = { created: boolean; projectId: string | null; jobId: string | null };
type BuildDetails = { jobId: string | null; projectId: string };

/**
 * Bit, the Mayor. The kid talks only to Bit through one profile-level conversation.
 * Each turn, Bit decides scope, confirms before creating, and delegates building to
 * worker bots via custom tools. Workers run in the background and Bit posts a
 * completion update when each finishes.
 */
export class BitCoordinatorService {
  private readonly profiles: ProfileReader;
  private readonly projects: ProjectService;
  private readonly conversation: ConversationService;
  private readonly mayor: MayorRuntime;
  private readonly worker: BitRuntime;
  private readonly botJobs: BotJobService;
  private readonly pipeline: BotPipeline;
  private readonly now: () => Date;

  private readonly listeners = new Set<(event: ChatEvent) => void>();
  private readonly toolCache = new Map<string, ToolDefinition[]>();
  private readonly inflight = new Map<string, Map<string, InflightWorker>>();
  private readonly mayorLocks = new Map<string, Promise<unknown>>();
  /** Tracks background worker pipelines so tests/shutdown can await them. */
  readonly pending = new Set<Promise<unknown>>();

  constructor(options: BitCoordinatorServiceOptions) {
    this.profiles = options.profiles;
    this.projects = options.projects;
    this.conversation = options.conversation;
    this.mayor = options.mayor;
    this.worker = options.worker;
    this.now = options.now ?? (() => new Date());
    this.botJobs = options.botJobs ?? new BotJobService({ now: this.now });
    this.pipeline = options.pipeline ?? new LocalBotPipeline(undefined, this.now);
  }

  subscribe(listener: (event: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: ChatEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  async load(profileId: string): Promise<ChatSnapshot> {
    await this.profiles.get(profileId);
    const messages = await this.conversation.readTranscript(profileId);
    return {
      profileId,
      messages,
      tools: [],
      isRunning: this.mayor.isRunning(profileId),
    };
  }

  async send(profileId: string, text: string): Promise<SendMessageResult> {
    const prompt = text.trim();
    if (!prompt) {
      return { ok: false, error: "Type a message for Bit first." };
    }

    try {
      const profile = await this.profiles.get(profileId);
      await this.conversation.appendMessage(profileId, {
        id: `user-${randomUUID()}`,
        role: "user",
        text: prompt,
        createdAt: this.now().toISOString(),
      });

      const portfolio = await this.projects.list(profileId);
      const requestText = `${this.buildRequestContext(profile, portfolio, this.listInflight(profileId))}\n\nBuilder says: ${prompt}`;
      const result = await this.runMayorTurn(profileId, requestText, { lifecycle: true });

      if (result.status === "failed") {
        return { ok: false, turnId: result.turnId, error: result.error ?? "Bit hit a problem." };
      }
      return { ok: true, turnId: result.turnId, status: result.status };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async abort(profileId: string): Promise<void> {
    await this.profiles.get(profileId);
    await this.mayor.abort(profileId);
    for (const worker of this.listInflight(profileId)) {
      await this.worker.abort(worker.jobId);
    }
  }

  // --- Mayor turns -----------------------------------------------------------

  private async runMayorTurn(
    profileId: string,
    text: string,
    { lifecycle }: { lifecycle: boolean },
  ) {
    return this.withMayorLock(profileId, async () => {
      const sessionFile = await this.conversation.getMayorSessionFile(profileId);
      const paths = this.conversation.paths(profileId);
      const onEvent = lifecycle
        ? (event: ChatEvent) => this.emit(event)
        : (event: ChatEvent) => {
            if (event.type !== "turn_start" && event.type !== "turn_end") this.emit(event);
          };

      const result = await this.mayor.prompt(
        {
          profileId,
          conversationDir: paths.conversationDir,
          mayorSessionsDir: paths.mayorSessionsDir,
          sessionFile,
          customTools: this.toolsFor(profileId),
        },
        text,
        onEvent,
      );

      if (result.sessionFile) {
        await this.conversation.setMayorSessionFile(profileId, result.sessionFile);
      }
      if (result.assistantText.trim()) {
        await this.conversation.appendMessage(profileId, {
          id: `assistant-${result.turnId}`,
          role: "assistant",
          text: result.assistantText,
          createdAt: this.now().toISOString(),
        });
      }
      return result;
    });
  }

  private async withMayorLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.mayorLocks.get(profileId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mayorLocks.set(
      profileId,
      previous.then(() => gate),
    );
    await previous.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }

  // --- Custom delegation tools ----------------------------------------------

  private toolsFor(profileId: string): ToolDefinition[] {
    const cached = this.toolCache.get(profileId);
    if (cached) return cached;
    const self = this;

    const listCreations = defineTool({
      name: "list_creations",
      label: "List creations",
      description: "List every creation in the builder's portfolio (title, id, last updated).",
      parameters: Type.Object({}),
      async execute() {
        const portfolio = await self.projects.list(profileId);
        const text = portfolio.length
          ? portfolio.map((p) => `- ${p.title} [id: ${p.id}] (updated ${p.updatedAt})`).join("\n")
          : "(no creations yet)";
        return { content: [{ type: "text", text }], details: { count: portfolio.length } };
      },
    });

    const createCreation = defineTool({
      name: "create_creation",
      label: "Create creation",
      description:
        "Start a brand new creation. Only call after the builder agreed to make it; pass confirmed: true. Returns immediately while a worker builds it in the background.",
      parameters: Type.Object({
        title: Type.String({ description: "short name you pick for the new creation" }),
        instructions: Type.String({ description: "what the worker should build first" }),
        confirmed: Type.Boolean({
          description: "true only after the builder said yes to making this",
        }),
      }),
      executionMode: "parallel",
      async execute(_callId, params) {
        const { title, instructions, confirmed } = params as {
          title: string;
          instructions: string;
          confirmed: boolean;
        };
        if (confirmed !== true) {
          return {
            content: [
              {
                type: "text",
                text: "Not created. Ask the builder to confirm first, then call again with confirmed: true.",
              },
            ],
            details: { created: false, projectId: null, jobId: null } as CreateDetails,
          };
        }
        const project = await self.projects.create(profileId, { title });
        const job = await self.slingWorker(profileId, project.id, instructions);
        return {
          content: [{ type: "text", text: `Started "${title}". A helper is building it now.` }],
          details: { created: true, projectId: project.id, jobId: job.id } as CreateDetails,
        };
      },
    });

    const delegateBuild = defineTool({
      name: "delegate_build",
      label: "Delegate build",
      description:
        "Send a worker bot to build or change ONE existing creation. Returns immediately; the worker runs in the background.",
      parameters: Type.Object({
        creationId: Type.String({ description: "id of the creation to work on" }),
        instructions: Type.String({ description: "what the worker should build or change" }),
      }),
      executionMode: "parallel",
      async execute(_callId, params) {
        const { creationId, instructions } = params as {
          creationId: string;
          instructions: string;
        };
        try {
          const job = await self.slingWorker(profileId, creationId, instructions);
          return {
            content: [{ type: "text", text: "A helper started working on that creation." }],
            details: { jobId: job.id, projectId: creationId } as BuildDetails,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Could not start that build: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            details: { jobId: null, projectId: creationId } as BuildDetails,
          };
        }
      },
    });

    const tools = [listCreations, createCreation, delegateBuild];
    this.toolCache.set(profileId, tools);
    return tools;
  }

  // --- Worker pipeline (background) -----------------------------------------

  /** Creates the job + workbench synchronously, then runs the build in the background. */
  private async slingWorker(
    profileId: string,
    creationId: string,
    instructions: string,
  ): Promise<BotJobRecord> {
    const project = await this.projects.get(profileId, creationId);
    const portfolio = await this.projects.list(profileId);
    const plan = await this.botJobs.createBuildPlan(project, instructions, portfolio);
    let job = await this.botJobs.createJob(project, plan);
    const workbench = await this.pipeline.prepareBotWorkbench(project, job);
    job = await this.botJobs.markRunning(project, job, workbench);

    this.addInflight(profileId, {
      jobId: job.id,
      projectId: project.id,
      title: project.title,
      instructions,
      startedAt: this.now().toISOString(),
    });

    const run = this.runWorkerPipeline(profileId, project, job, workbench, instructions).catch(
      () => {},
    );
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
    return job;
  }

  private async runWorkerPipeline(
    profileId: string,
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: { path: string },
    instructions: string,
  ): Promise<void> {
    const profile = await this.profiles.get(profileId).catch(() => undefined);
    let outcome: "completed" | "cancelled" | "failed" = "completed";
    let summary = "";
    try {
      const botProject: RuntimeProject = {
        ...project,
        mainWorkbenchDir: workbench.path,
        bitSessionsDir: project.botSessionsDir,
        activeBitSessionFile: undefined,
        runtimeKey: job.id,
      };
      let workerText = "";
      const result = await this.worker.sendPrompt(
        botProject,
        workerPrompt({ instructions, profile, project }),
        (event) => {
          if (event.type === "assistant_delta") {
            workerText += event.text;
            return;
          }
          // Surface only ambient build activity (tool rows), tagged with the creation.
          if (
            event.type === "tool_start" ||
            event.type === "tool_update" ||
            event.type === "tool_end"
          ) {
            this.emit(event);
          }
        },
      );

      if (result.status === "failed") {
        await this.botJobs.jam(project, job, result.error ?? "The worker hit a problem.");
        outcome = "failed";
        summary = result.error ?? "The worker hit a problem.";
      } else if (result.status === "cancelled") {
        await this.botJobs.cancel(project, job);
        outcome = "cancelled";
        summary = "The build was stopped.";
      } else {
        const inspections = await this.pipeline.runMachines(project, job, workbench as never);
        const failed = inspections.find((inspection) => inspection.status === "failed");
        if (failed) {
          await this.botJobs.jam(project, job, failed.message ?? "A machine rejected the build.");
          outcome = "failed";
          summary = failed.message ?? "A machine rejected the build.";
        } else {
          const build = await this.pipeline.installBotBuild(project, job, workbench as never);
          await this.botJobs.complete(project, job, inspections, build);
          await this.projects.touch(profileId, project.id, this.now().toISOString());
          summary = workerText.trim() || "All done.";
        }
      }
    } catch (error) {
      await this.botJobs.jam(project, job, error instanceof Error ? error.message : String(error));
      outcome = "failed";
      summary = error instanceof Error ? error.message : String(error);
    } finally {
      this.worker.disposeProject?.(job.id);
      this.removeInflight(profileId, job.id);
    }

    await this.runCompletionTurn(profileId, project, outcome, summary).catch(async () => {
      await this.appendCompletionFallback(profileId, project, outcome);
    });
  }

  private async runCompletionTurn(
    profileId: string,
    project: RuntimeProject,
    outcome: "completed" | "cancelled" | "failed",
    summary: string,
  ): Promise<void> {
    const text =
      outcome === "completed"
        ? `A worker just finished building "${project.title}" (id: ${project.id}). What it did: ${summary}\n\nTell the builder warmly that "${project.title}" is ready, in one or two short sentences.`
        : outcome === "cancelled"
          ? `The build for "${project.title}" (id: ${project.id}) was stopped before finishing. Let the builder know gently in one short sentence.`
          : `A worker ran into a problem building "${project.title}" (id: ${project.id}): ${summary}\n\nLet the builder know gently in one short sentence and offer to try again.`;
    await this.runMayorTurn(profileId, text, { lifecycle: false });
  }

  private async appendCompletionFallback(
    profileId: string,
    project: RuntimeProject,
    outcome: "completed" | "cancelled" | "failed",
  ): Promise<void> {
    const text =
      outcome === "completed"
        ? `${project.title} is ready.`
        : outcome === "cancelled"
          ? `The build for ${project.title} was stopped.`
          : `${project.title} hit a snag. We can try again.`;
    const turnId = `completion-fallback-${project.id}-${this.now().getTime()}`;
    await this.conversation.appendMessage(profileId, {
      id: `assistant-${turnId}`,
      role: "assistant",
      text,
      createdAt: this.now().toISOString(),
      projectId: project.id,
    });
    this.emit({
      type: "assistant_delta",
      profileId,
      projectId: project.id,
      projectTitle: project.title,
      turnId,
      text,
    });
  }

  // --- In-flight registry ----------------------------------------------------

  private addInflight(profileId: string, worker: InflightWorker): void {
    const map = this.inflight.get(profileId) ?? new Map<string, InflightWorker>();
    map.set(worker.jobId, worker);
    this.inflight.set(profileId, map);
  }

  private removeInflight(profileId: string, jobId: string): void {
    this.inflight.get(profileId)?.delete(jobId);
  }

  private listInflight(profileId: string): InflightWorker[] {
    return [...(this.inflight.get(profileId)?.values() ?? [])];
  }

  private buildRequestContext(
    profile: ProfileSummary,
    portfolio: ProjectSummary[],
    inflight: InflightWorker[],
  ): string {
    const interests = profile.interests.length ? profile.interests.join(", ") : "not set";
    const portfolioText = portfolio.length
      ? portfolio.map((p) => `- ${p.title} [id: ${p.id}] (updated ${p.updatedAt})`).join("\n")
      : "(no creations yet)";
    const inflightText = inflight.length
      ? inflight.map((w) => `- "${w.title}" [id: ${w.projectId}]: ${w.instructions}`).join("\n")
      : "(nothing building right now)";
    return [
      `Builder: ${profile.name}, age ${profile.age}. Interests: ${interests}.${profile.notes ? ` Parent notes: ${profile.notes}` : ""}`,
      `Portfolio:\n${portfolioText}`,
      `Currently building:\n${inflightText}`,
    ].join("\n\n");
  }
}

function workerPrompt(input: {
  instructions: string;
  profile: ProfileSummary | undefined;
  project: RuntimeProject;
}): string {
  const profileLines = input.profile
    ? `Builder:
- Name: ${input.profile.name}
- Age: ${input.profile.age}
- Interests: ${input.profile.interests.length ? input.profile.interests.join(", ") : "not set"}
- Parent notes: ${input.profile.notes?.trim() || "None."}`
    : "Builder: a young creator.";
  return `Build or change this creation in your isolated Workbench.

${profileLines}

Creation: ${input.project.title}

Job:
${input.instructions}

Do the work in this Workbench only. Bit will run Machines and the Assembly Line after you finish.`;
}

export type { ChatMessage };
