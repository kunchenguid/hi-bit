import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type {
  ChatEvent,
  ChatMessage,
  ChatSnapshot,
  CreationActivity,
  ImageReference,
  OutgoingImage,
  PreviewInfo,
  SendMessageResult,
  ToolActivity,
  TurnKind,
} from "@shared/chat";
import {
  buildVocabularyNote,
  type ConceptId,
  conceptById,
  nextConceptToUnlock,
  type UnlockFacts,
} from "@shared/concepts";
import type { ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { Type } from "typebox";
import { type BlueprintReference, type BotJobRecord, BotJobService } from "../bots/botJobService";
import { type BotPipeline, LocalBotPipeline } from "../bots/botPipeline";
import type { AttachmentSummary, ConversationService } from "../conversation/conversationService";
import type { BitPromptImage, BitRuntime } from "../pi/bitRuntimeService";
import { stripImageData } from "../pi/piMessages";
import { PreviewService } from "../preview/previewService";
import type { ProjectService, RuntimeProject } from "../projects/projectService";

/** Static-server fallback for replaying a creation previewed before its command was persisted. */
const DEFAULT_PREVIEW_COMMAND = 'python3 -m http.server "$PORT" --bind 127.0.0.1';

/** Bot runtime: runs a build for one creation in its isolated workbench. */
export type BotRuntime = {
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
  unlockConcept: (profileId: string, conceptId: ConceptId) => Promise<ProfileSummary>;
  markConceptPendingReveal: (profileId: string, conceptId: ConceptId) => Promise<ProfileSummary>;
  markConceptRevealed: (profileId: string, conceptId: ConceptId) => Promise<ProfileSummary>;
  bumpBuildsDelegated: (profileId: string) => Promise<void>;
  markActivitiesOpened: (profileId: string) => Promise<ProfileSummary>;
};

type BitCoordinatorServiceOptions = {
  profiles: ProfileReader;
  projects: ProjectService;
  conversation: ConversationService;
  bit: BitRuntime;
  bot: BotRuntime;
  preview?: PreviewService;
  botJobs?: BotJobService;
  pipeline?: BotPipeline;
  now?: () => Date;
};

type InflightBot = {
  jobId: string;
  projectId: string;
  title: string;
  instructions: string;
  startedAt: string;
};

type TurnVocabulary = {
  note: string;
  pendingReveal: ConceptId | null;
};

type CreateDetails = { created: boolean; projectId: string | null; jobId: string | null };
type BuildDetails = { jobId: string | null; projectId: string };
type PreviewToolDetails = { projectId: string; url: string | null };

/**
 * Bit, the coordinator. The kid talks only to Bit through one profile-level conversation.
 * Each turn, Bit decides scope, confirms before creating, delegates substantive
 * building to background bots, or makes tiny direct edits through jailed
 * profile tools. Bot completions and direct edits are recorded in the
 * creation logbook.
 */
export class BitCoordinatorService {
  private readonly profiles: ProfileReader;
  private readonly projects: ProjectService;
  private readonly conversation: ConversationService;
  private readonly bit: BitRuntime;
  private readonly bot: BotRuntime;
  private readonly preview: PreviewService;
  private readonly botJobs: BotJobService;
  private readonly pipeline: BotPipeline;
  private readonly now: () => Date;

  private readonly listeners = new Set<(event: ChatEvent) => void>();
  private readonly toolCache = new Map<string, ToolDefinition[]>();
  private readonly inflight = new Map<string, Map<string, InflightBot>>();
  private readonly bitLocks = new Map<string, Promise<unknown>>();
  private readonly activeTurns = new Map<string, { id: string; kind: TurnKind }>();
  /** Serializes logbook appends per creation so persisted steps keep their order. */
  private readonly activityWrites = new Map<string, Promise<unknown>>();
  /** Creation a turn just started a preview for, so its reply can offer Play. */
  private readonly pendingPreviewAttribution = new Map<string, string>();
  /** Tracks background bot pipelines so tests/shutdown can await them. */
  readonly pending = new Set<Promise<unknown>>();

  constructor(options: BitCoordinatorServiceOptions) {
    this.profiles = options.profiles;
    this.projects = options.projects;
    this.conversation = options.conversation;
    this.bit = options.bit;
    this.bot = options.bot;
    this.now = options.now ?? (() => new Date());
    this.preview =
      options.preview ??
      new PreviewService({
        resolveWorkbenchDir: (profileId, projectId) =>
          this.projects.pathsFor(profileId, projectId).mainWorkbenchDir,
        now: this.now,
      });
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
    const safe =
      event.type === "tool_end" || event.type === "tool_update"
        ? { ...event, content: stripImageData(event.content) }
        : event;
    for (const listener of this.listeners) listener(safe);
  }

  async load(profileId: string): Promise<ChatSnapshot> {
    await this.profiles.get(profileId);
    const messages = await this.conversation.readTranscript(profileId);
    // Activity is a derived view rebuilt from each creation's logbook (and it
    // even writes back to close stale steps). A hiccup there must never reject
    // the load and blank the transcript the kid actually cares about - degrade
    // to no activity instead.
    let activity: CreationActivity[] = [];
    let playableProjectIds: string[] = [];
    try {
      activity = await this.buildActivity(profileId);
    } catch (error) {
      console.error(`Failed to rebuild activity for profile ${profileId}:`, error);
    }
    try {
      const portfolio = await this.projects.list(profileId);
      const playable = await Promise.all(
        portfolio.map(async (p) =>
          p.lastPreviewCommand || (await this.projects.hasPreviewHistory(profileId, p.id))
            ? p.id
            : null,
        ),
      );
      playableProjectIds = playable.filter((id): id is string => id !== null);
    } catch (error) {
      console.error(`Failed to read playable previews for profile ${profileId}:`, error);
    }
    return {
      profileId,
      messages,
      activity,
      isRunning: this.bit.isRunning(profileId),
      activeTurn: this.activeTurns.get(profileId) ?? null,
      previews: this.preview.list(profileId),
      playableProjectIds,
    };
  }

  /**
   * Rebuilds the per-creation activity log from each creation's on-disk logbook,
   * marking a creation "working" when a bot is currently in flight for it.
   * This is what lets the activity view survive a renderer reload.
   */
  private async buildActivity(profileId: string): Promise<CreationActivity[]> {
    const portfolio = await this.projects.list(profileId);
    const activity: CreationActivity[] = [];
    for (const project of portfolio) {
      const wasWorking = this.hasInflightForProject(profileId, project.id);
      await this.waitForActivityWrites(profileId, project.id);
      const isWorking = this.hasInflightForProject(profileId, project.id);
      if (!isWorking) {
        await this.projects.closeRunningActivity(profileId, project.id, "failed");
      }
      const latestActivityAt = await this.projects.latestActivityAt(profileId, project.id);
      const updatedAt = latestActivityAt ?? project.updatedAt;
      const steps = await this.projects.readActivity(profileId, project.id);
      if (steps.length === 0 && !isWorking && !wasWorking && !latestActivityAt) continue;
      activity.push({
        projectId: project.id,
        title: project.title,
        status: isWorking ? "working" : "done",
        updatedAt,
        steps: steps.map((step) => ({
          ...step,
          projectId: project.id,
          projectTitle: project.title,
        })),
      });
    }
    return activity.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async send(profileId: string, text: string, image?: OutgoingImage): Promise<SendMessageResult> {
    const prompt = text.trim();
    if (!prompt && !image) {
      return { ok: false, error: "Type a message for Bit first." };
    }

    try {
      const profile = await this.profiles.get(profileId);
      // Persist the picture as a lean on-disk reference (mime + path, no base64);
      // the transcript reader rehydrates the bytes for the renderer.
      const storedImage = image
        ? await this.conversation.saveAttachment(profileId, image)
        : undefined;
      await this.conversation.appendMessage(profileId, {
        id: `user-${randomUUID()}`,
        role: "user",
        text: prompt,
        createdAt: this.now().toISOString(),
        image: storedImage,
      });

      const portfolio = await this.projects.list(profileId);
      // Image-only messages still need words for Bit, so it knows a picture came in.
      const builderSays = prompt || "(the builder shared a picture without words)";
      // Tell Bit the picture's reference id so it can hand it to a build as art
      // direction (now, or later via list_builder_pictures).
      const pictureNote = storedImage?.id
        ? `\n(The builder attached a picture - reference id: ${storedImage.id}. To build something whose look matches it, pass this id to create_creation or delegate_build as referencePictureIds.)`
        : "";
      const requestText = `${this.buildRequestContext(profile, portfolio, this.listInflight(profileId))}\n\nBuilder says: ${builderSays}${pictureNote}`;
      const paths = this.conversation.paths(profileId);
      const imageData = storedImage
        ? await this.conversation.readAttachmentData(profileId, storedImage)
        : undefined;
      const result = await this.runBitTurn(profileId, requestText, {
        kind: "reply",
        images: storedImage?.path
          ? [
              {
                type: "image",
                path: join(paths.conversationDir, storedImage.path),
                mimeType: storedImage.mimeType,
                data: imageData,
              },
            ]
          : undefined,
      });

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
    await this.bit.abort(profileId);
    for (const bot of this.listInflight(profileId)) {
      await this.bot.abort(bot.jobId);
    }
  }

  /**
   * Idempotently makes a creation playable: ensures its preview server is
   * running (restarting it from the remembered command if the process is gone,
   * e.g. after an app quit) and returns where to point the pane. PreviewService
   * no-ops when the server is already up, so repeated Play presses are safe.
   */
  async playPreview(profileId: string, projectId: string): Promise<PreviewInfo> {
    await this.profiles.get(profileId);
    const project = await this.projects.get(profileId, projectId);
    // Prefer the exact command Bit used; for creations previewed before it was
    // persisted, fall back to the static default (the common kid case).
    const command =
      project.lastPreviewCommand ??
      ((await this.projects.hasPreviewHistory(profileId, projectId))
        ? DEFAULT_PREVIEW_COMMAND
        : undefined);
    if (!command) {
      throw new Error("That creation has no preview to play yet.");
    }
    const info = await this.preview.start(profileId, projectId, command, project.title);
    this.emit({
      type: "preview_ready",
      profileId,
      projectId,
      projectTitle: project.title,
      url: info.url,
    });
    try {
      await this.projects.recordPreviewServer(profileId, projectId, info);
    } catch {}
    try {
      await this.projects.rememberPreviewCommand(profileId, projectId, command);
    } catch {}
    return info;
  }

  // --- Bit turns -----------------------------------------------------------

  private async runBitTurn(
    profileId: string,
    text: string,
    { kind, projectId, images }: { kind: TurnKind; projectId?: string; images?: BitPromptImage[] },
  ) {
    return this.withBitLock(profileId, async () => {
      // Fresh attribution per turn: start_preview sets it mid-turn (below).
      this.pendingPreviewAttribution.delete(profileId);
      // Gate Bit's vocabulary to this kid's unlocked inside words, unlocking at
      // most one new word this turn and asking Bit to reveal it warmly.
      const vocabulary = await this.resolveTurnVocabulary(profileId);
      const promptText = `${text}\n\n${vocabulary.note}`;
      const sessionFile = await this.conversation.getBitSessionFile(profileId);
      const paths = this.conversation.paths(profileId);
      // Tag the turn's lifecycle so the renderer can word the "thinking" bubble
      // (a bot-result turn reads differently than Bit answering the kid), and
      // stamp the streamed reply with the creation it previewed, so the live
      // bubble (built from deltas) can show Play without waiting for a reload.
      const decorate = (event: ChatEvent): ChatEvent => {
        if (event.type === "turn_start" || event.type === "turn_end") {
          if (event.type === "turn_start") {
            this.activeTurns.set(profileId, { id: event.turnId, kind });
          } else if (this.activeTurns.get(profileId)?.id === event.turnId) {
            this.activeTurns.delete(profileId);
          }
          return { ...event, kind };
        }
        if (event.type !== "assistant_delta") return event;
        const attributed = projectId ?? this.pendingPreviewAttribution.get(profileId);
        return attributed ? { ...event, projectId: attributed } : event;
      };
      const onEvent = (event: ChatEvent) => this.emit(decorate(event));

      const result = await this.bit.prompt(
        {
          profileId,
          profileRoot: paths.profileRoot,
          conversationDir: paths.conversationDir,
          bitSessionsDir: paths.bitSessionsDir,
          sessionFile,
          customTools: this.toolsFor(profileId),
          onProfileMutation: async (mutation) => {
            await this.projects.touch(profileId, mutation.projectId);
            await this.projects.appendActivity(profileId, mutation.projectId, {
              type: "direct_edit",
              projectId: mutation.projectId,
              tool: mutation.tool,
              path: mutation.path,
            });
          },
        },
        promptText,
        onEvent,
        images ? { images } : undefined,
      );

      if (result.sessionFile) {
        await this.conversation.setBitSessionFile(profileId, result.sessionFile);
      }
      if (result.assistantText.trim()) {
        await this.conversation.appendMessage(profileId, {
          id: `assistant-${result.turnId}`,
          role: "assistant",
          text: result.assistantText,
          createdAt: this.now().toISOString(),
          // Explicit (completion turns) wins; otherwise attribute to a preview
          // this turn started, so the "ready" reply can show a Play button.
          projectId: projectId ?? this.pendingPreviewAttribution.get(profileId),
        });
        if (
          vocabulary.pendingReveal &&
          assistantRevealedConcept(result.assistantText, vocabulary.pendingReveal)
        ) {
          await this.profiles
            .markConceptRevealed(profileId, vocabulary.pendingReveal)
            .then(() => this.emit({ type: "profile_updated", profileId, turnId: result.turnId }))
            .catch((error) => {
              console.error(
                `Failed to persist revealed concept ${vocabulary.pendingReveal} for profile ${profileId}:`,
                error,
              );
            });
        }
      }
      this.pendingPreviewAttribution.delete(profileId);
      return result;
    });
  }

  private async withBitLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.bitLocks.get(profileId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.bitLocks.set(
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

    const listBuilderPictures = defineTool({
      name: "list_builder_pictures",
      label: "List builder pictures",
      description:
        "List pictures the builder has shared in chat, newest first, with the id you pass to create_creation/delegate_build referencePictureIds to use one as art direction for a build.",
      parameters: Type.Object({}),
      async execute() {
        const pictures = await self.conversation.listAttachments(profileId);
        const text = pictures.length
          ? pictures
              .map((p) => `- [id: ${p.id}] shared ${p.sharedAt}; message: ${p.messageText}`)
              .join("\n")
          : "(the builder hasn't shared any pictures yet)";
        return { content: [{ type: "text", text }], details: { count: pictures.length } };
      },
    });

    const createCreation = defineTool({
      name: "create_creation",
      label: "Create creation",
      description:
        "Start a brand new creation. Only call after the builder agreed to make it; pass confirmed: true. Returns immediately while a bot builds it.",
      parameters: Type.Object({
        title: Type.String({ description: "short name you pick for the new creation" }),
        instructions: Type.String({
          description: "what the bot should build first",
        }),
        confirmed: Type.Boolean({
          description: "true only after the builder said yes to making this",
        }),
        referencePictureIds: Type.Optional(
          Type.Array(Type.String(), {
            description:
              "ids of pictures the builder shared to give the bot as art-direction references (a picture they just shared, or one from list_builder_pictures). Use when the builder wants the look based on a picture.",
          }),
        ),
      }),
      executionMode: "parallel",
      async execute(_callId, params) {
        const { title, instructions, confirmed, referencePictureIds } = params as {
          title: string;
          instructions: string;
          confirmed: boolean;
          referencePictureIds?: string[];
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
        try {
          await self.resolveReferences(profileId, referencePictureIds);
          const project = await self.projects.create(profileId, { title });
          const job = await self.slingBot(profileId, project.id, instructions, referencePictureIds);
          return {
            content: [{ type: "text", text: `Started "${title}". A bot is building it now.` }],
            details: { created: true, projectId: project.id, jobId: job.id } as CreateDetails,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Not created: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            details: { created: false, projectId: null, jobId: null } as CreateDetails,
          };
        }
      },
    });

    const delegateBuild = defineTool({
      name: "delegate_build",
      label: "Delegate build",
      description:
        "Send a bot to build or change ONE existing creation. Returns immediately; the build runs in the background.",
      parameters: Type.Object({
        creationId: Type.String({ description: "id of the creation to work on" }),
        instructions: Type.String({
          description: "what the bot should build or change",
        }),
        referencePictureIds: Type.Optional(
          Type.Array(Type.String(), {
            description:
              "ids of pictures the builder shared to give the bot as art-direction references (a picture they just shared, or one from list_builder_pictures). Use when the builder wants the look based on a picture.",
          }),
        ),
      }),
      executionMode: "parallel",
      async execute(_callId, params) {
        const { creationId, instructions, referencePictureIds } = params as {
          creationId: string;
          instructions: string;
          referencePictureIds?: string[];
        };
        try {
          const job = await self.slingBot(profileId, creationId, instructions, referencePictureIds);
          return {
            content: [{ type: "text", text: "A bot started working on that creation." }],
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

    const startPreview = defineTool({
      name: "start_preview",
      label: "Start preview",
      description:
        "Start a live preview server so the builder can play a creation. command is REQUIRED and runs INSIDE that creation's main-workbench/ directory; it MUST bind to the PORT environment variable. For a plain static creation (index.html with css/js), pass exactly: python3 -m http.server \"$PORT\" --bind 127.0.0.1. For a creation with its own dev server, pass that creation's start command. Returns once the server is answering.",
      parameters: Type.Object({
        projectId: Type.String({ description: "id of the creation to preview" }),
        command: Type.String({
          description: "command that serves the creation and binds to $PORT",
        }),
      }),
      async execute(_callId, params) {
        const { projectId, command } = params as { projectId: string; command: string };
        try {
          const project = await self.projects.get(profileId, projectId);
          const info = await self.preview.start(profileId, projectId, command, project.title);
          self.emit({
            type: "preview_ready",
            profileId,
            projectId,
            projectTitle: project.title,
            url: info.url,
          });
          try {
            await self.projects.recordPreviewServer(profileId, projectId, info);
          } catch {}
          try {
            await self.projects.rememberPreviewCommand(profileId, projectId, command);
          } catch {}
          // Tag this turn's reply with the creation so the bubble can offer Play.
          self.pendingPreviewAttribution.set(profileId, projectId);
          const details: PreviewToolDetails = { projectId, url: info.url };
          return {
            content: [
              { type: "text", text: "Your preview is live! Tell the builder they can press Play." },
            ],
            details,
          };
        } catch (error) {
          const details: PreviewToolDetails = { projectId, url: null };
          return {
            content: [
              {
                type: "text",
                text: `Could not start that preview: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            details,
          };
        }
      },
    });

    const listPreviews = defineTool({
      name: "list_previews",
      label: "List previews",
      description:
        "List every creation that currently has a live preview server (title, id, url, when it started).",
      parameters: Type.Object({}),
      async execute() {
        const previews = self.preview.list(profileId);
        const text = previews.length
          ? previews
              .map(
                (p) =>
                  `- ${p.title ?? p.projectId} [id: ${p.projectId}] ${p.url} (started ${p.startedAt})`,
              )
              .join("\n")
          : "(no previews running)";
        return { content: [{ type: "text", text }], details: { count: previews.length } };
      },
    });

    const stopPreview = defineTool({
      name: "stop_preview",
      label: "Stop preview",
      description: "Stop a creation's live preview server when it is no longer needed.",
      parameters: Type.Object({
        projectId: Type.String({ description: "id of the creation whose preview to stop" }),
      }),
      async execute(_callId, params) {
        const { projectId } = params as { projectId: string };
        const stopped = self.preview.stop(projectId, profileId);
        if (stopped) self.emit({ type: "preview_stopped", profileId, projectId });
        return {
          content: [
            {
              type: "text",
              text: stopped ? "Stopped that preview." : "That preview was not running.",
            },
          ],
          details: { projectId, stopped },
        };
      },
    });

    const tools = [
      listCreations,
      listBuilderPictures,
      createCreation,
      delegateBuild,
      startPreview,
      listPreviews,
      stopPreview,
    ];
    this.toolCache.set(profileId, tools);
    return tools;
  }

  // --- Bot pipeline (background) -----------------------------------------

  /** Creates the job + workbench synchronously, then runs the build in the background. */
  private async slingBot(
    profileId: string,
    creationId: string,
    instructions: string,
    referencePictureIds?: string[],
  ): Promise<BotJobRecord> {
    const project = await this.projects.get(profileId, creationId);
    const portfolio = await this.projects.list(profileId);
    // Resolve the builder's chosen pictures once: durable (relative) refs go on
    // the blueprint, and the same set feeds the bot run as art-direction.
    const references = await this.resolveReferences(profileId, referencePictureIds);
    const blueprintReferences: BlueprintReference[] = references.map((reference) => ({
      id: reference.id,
      path: reference.path,
      mimeType: reference.mimeType,
    }));
    const blueprint = await this.botJobs.createBlueprint(
      project,
      instructions,
      portfolio,
      blueprintReferences,
    );
    let job = await this.botJobs.createJob(project, blueprint);
    const workbench = await this.pipeline.prepareBotWorkbench(project, job);
    job = await this.botJobs.markRunning(project, job, workbench);

    this.addInflight(profileId, {
      jobId: job.id,
      projectId: project.id,
      title: project.title,
      instructions,
      startedAt: this.now().toISOString(),
    });

    const run = this.runBotPipeline(
      profileId,
      project,
      job,
      workbench,
      instructions,
      references,
    ).catch(() => {});
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
    return job;
  }

  /** Looks up the builder pictures Bit named for a build. */
  private async resolveReferences(
    profileId: string,
    ids: string[] | undefined,
  ): Promise<AttachmentSummary[]> {
    if (!ids?.length) return [];
    const resolved: AttachmentSummary[] = [];
    for (const id of ids) {
      const found = await this.conversation.resolveAttachment(profileId, id);
      if (!found) throw new Error(`Builder picture id not found: ${id}`);
      resolved.push(found);
    }
    return resolved;
  }

  private async runBotPipeline(
    profileId: string,
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: { path: string },
    instructions: string,
    references: AttachmentSummary[] = [],
  ): Promise<void> {
    const profile = await this.profiles.get(profileId).catch(() => undefined);
    // The builder's pictures live at factory level; hand the bot run absolute
    // paths to them so generate_image can read them as references without
    // copying anything into the creation.
    const conversationDir = this.conversation.paths(profileId).conversationDir;
    const runtimeReferences: ImageReference[] = references.map((reference) => ({
      id: reference.id,
      path: join(conversationDir, reference.path),
      mimeType: reference.mimeType,
    }));
    let outcome: "completed" | "cancelled" | "failed" = "completed";
    let summary = "";
    let readyToPlay = false;
    const buildMeta = {
      profileId,
      projectId: project.id,
      projectTitle: project.title,
      turnId: job.id,
    };
    this.emit({ type: "build_start", ...buildMeta });
    this.persistActivity(profileId, project.id, {
      type: "build_activity",
      turnId: job.id,
      status: "started",
    });
    try {
      const botProject: RuntimeProject = {
        ...project,
        mainWorkbenchDir: workbench.path,
        bitSessionsDir: project.botSessionsDir,
        activeBitSessionFile: undefined,
        runtimeKey: job.id,
        references: runtimeReferences.length ? runtimeReferences : undefined,
      };
      let botText = "";
      const result = await this.bot.sendPrompt(
        botProject,
        botPrompt({ instructions, profile, project, references }),
        (event) => {
          if (event.type === "assistant_delta") {
            botText += event.text;
            return;
          }
          // Surface ambient build activity (tool rows), tagged with the creation,
          // and persist start/end to the creation's logbook so it survives reloads.
          if (event.type === "tool_start") {
            // Carry the bot's task so the Logbook can name it by what it was
            // asked to build, not its latest tool call. Persisted on the start
            // row so it survives a reload (readActivity rebuilds from these).
            this.emit({ ...event, turnId: job.id, summary: instructions });
            this.persistToolStep(profileId, project.id, {
              type: "tool_step",
              callId: event.callId,
              turnId: job.id,
              toolName: event.toolName,
              status: "running",
              args: event.args,
              summary: instructions,
            });
          } else if (event.type === "tool_update") {
            this.emit({ ...event, turnId: job.id });
          } else if (event.type === "tool_end") {
            this.emit({ ...event, turnId: job.id });
            this.persistToolStep(profileId, project.id, {
              type: "tool_step",
              callId: event.callId,
              turnId: job.id,
              status: event.isError ? "failed" : "completed",
              // Image-returning tools give the model real pixels to see; keep
              // that base64 out of the on-disk logbook (the model still has it
              // in its session transcript).
              content: stripImageData(event.content),
            });
          }
        },
      );

      if (result.status === "failed") {
        await this.botJobs.jam(project, job, result.error ?? "The bot hit a problem.");
        outcome = "failed";
        summary = result.error ?? "The bot hit a problem.";
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
          const parsed = extractReadyToPlay(botText);
          readyToPlay = parsed.readyToPlay;
          summary = parsed.summary || "All done.";
        }
      }
    } catch (error) {
      await this.botJobs.jam(project, job, error instanceof Error ? error.message : String(error));
      outcome = "failed";
      summary = error instanceof Error ? error.message : String(error);
    } finally {
      this.bot.disposeProject?.(job.id);
      this.removeInflight(profileId, job.id);
      const closedSteps = await this.closeRunningActivity(profileId, project.id, job.id, outcome);
      for (const step of closedSteps) {
        this.emit({
          type: "tool_end",
          ...buildMeta,
          callId: step.callId,
          isError: step.status === "failed",
          content: step.content,
        });
      }
      await this.persistActivity(profileId, project.id, {
        type: "build_activity",
        turnId: job.id,
        status: outcome,
      });
      if (!this.hasInflightForProject(profileId, project.id)) {
        this.emit({ type: "build_end", ...buildMeta, status: outcome });
      }
    }

    await this.profiles.bumpBuildsDelegated(profileId).catch(() => {});
    await this.runCompletionTurn(profileId, project, outcome, summary, readyToPlay).catch(
      async () => {
        await this.appendCompletionFallback(profileId, project, outcome);
      },
    );
  }

  private async runCompletionTurn(
    profileId: string,
    project: RuntimeProject,
    outcome: "completed" | "cancelled" | "failed",
    summary: string,
    readyToPlay = false,
  ): Promise<void> {
    const text = buildCompletionPrompt({
      outcome,
      projectId: project.id,
      title: project.title,
      summary: kidSafeCompletionSummary(summary),
      readyToPlay,
    });
    await this.runBitTurn(profileId, text, { kind: "bot_result", projectId: project.id });
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

  /** Queues a logbook append per creation so concurrent steps keep their order. */
  private persistActivity(profileId: string, projectId: string, row: unknown): Promise<void> {
    const key = `${profileId}:${projectId}`;
    const previous = this.activityWrites.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => this.projects.appendActivity(profileId, projectId, row));
    this.activityWrites.set(key, next);
    this.pending.add(next);
    void next.catch(() => {}).finally(() => this.pending.delete(next));
    return next;
  }

  private persistToolStep(profileId: string, projectId: string, row: unknown): void {
    void this.persistActivity(profileId, projectId, row);
  }

  private async waitForActivityWrites(profileId: string, projectId: string): Promise<void> {
    const key = `${profileId}:${projectId}`;
    await this.activityWrites.get(key)?.catch(() => {});
  }

  private async closeRunningActivity(
    profileId: string,
    projectId: string,
    jobId: string,
    outcome: "completed" | "cancelled" | "failed",
  ): Promise<ToolActivity[]> {
    await this.waitForActivityWrites(profileId, projectId);
    return this.projects.closeRunningActivity(
      profileId,
      projectId,
      outcome === "completed" ? "completed" : "failed",
      jobId,
    );
  }

  // --- In-flight registry ----------------------------------------------------

  private addInflight(profileId: string, bot: InflightBot): void {
    const map = this.inflight.get(profileId) ?? new Map<string, InflightBot>();
    map.set(bot.jobId, bot);
    this.inflight.set(profileId, map);
  }

  private removeInflight(profileId: string, jobId: string): void {
    this.inflight.get(profileId)?.delete(jobId);
  }

  private listInflight(profileId: string): InflightBot[] {
    return [...(this.inflight.get(profileId)?.values() ?? [])];
  }

  private hasInflightForProject(profileId: string, projectId: string): boolean {
    return this.listInflight(profileId).some((bot) => bot.projectId === projectId);
  }

  /**
   * Records that the kid opened the Logbook, so the word can unlock and be
   * revealed by Bit on the next turn.
   */
  async markActivitiesOpened(profileId: string): Promise<void> {
    await this.profiles.markActivitiesOpened(profileId);
  }

  /**
   * Builds the per-turn "Words you may use" note that gates Bit's vocabulary to
   * this kid's unlocked inside words. Unlocks at most one new concept per turn
   * (the pacing guard) and asks Bit to reveal it once. Degrades to the base
   * words on any read/write hiccup so a vocabulary problem never breaks a turn.
   */
  private async resolveTurnVocabulary(profileId: string): Promise<TurnVocabulary> {
    try {
      const profile = await this.profiles.get(profileId);
      const creationCount = (await this.projects.list(profileId)).length;
      const facts: UnlockFacts = {
        buildsDelegated: profile.unlockStats.buildsDelegated,
        creationCount,
        openedActivities: profile.unlockStats.openedActivities,
      };
      const unlocked = profile.unlockedConcepts.map((concept) => concept.id);
      const pending = profile.pendingConceptReveals.map((concept) => concept.id);
      const pendingReveal = pending[0] ?? nextConceptToUnlock(facts, [...unlocked, ...pending]);
      if (pendingReveal && !pending.includes(pendingReveal)) {
        await this.profiles.markConceptPendingReveal(profileId, pendingReveal);
      }
      const newlyUnlocked = pending.includes(pendingReveal as ConceptId) ? null : pendingReveal;
      return {
        note: buildVocabularyNote(unlocked, pendingReveal, newlyUnlocked),
        pendingReveal,
      };
    } catch (error) {
      console.error(`Failed to resolve unlock vocabulary for profile ${profileId}:`, error);
      return { note: buildVocabularyNote([], null), pendingReveal: null };
    }
  }

  private buildRequestContext(
    profile: ProfileSummary,
    portfolio: ProjectSummary[],
    inflight: InflightBot[],
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

function botPrompt(input: {
  instructions: string;
  profile: ProfileSummary | undefined;
  project: RuntimeProject;
  references?: AttachmentSummary[];
}): string {
  const profileLines = input.profile
    ? `Builder:
- Name: ${input.profile.name}
- Age: ${input.profile.age}
- Interests: ${input.profile.interests.length ? input.profile.interests.join(", ") : "not set"}
- Parent notes: ${input.profile.notes?.trim() || "None."}`
    : "Builder: a young creator.";
  const referenceLines = input.references?.length
    ? `\n\nReference pictures the builder shared - match their art direction. When you draw art, pass these ids to generate_image's reference_paths so the look matches:
${input.references.map((reference) => `- ${reference.id}`).join("\n")}`
    : "";
  return `Build or change this creation in your isolated Workbench.

${profileLines}

Creation: ${input.project.title}

Job:
${input.instructions}${referenceLines}

Do the work in this Workbench only. Bit will run Machines and the Assembly Line after you finish.`;
}

function assistantRevealedConcept(text: string, conceptId: ConceptId): boolean {
  const word = conceptById(conceptId).word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\P{L})${word}(?=\\P{L}|$)`, "iu").test(text);
}

function kidSafeCompletionSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return "All done.";
  return trimmed
    .replace(/\bworker\b/gi, "bot")
    .replace(/\bbot_job_[a-z0-9_-]+\b/gi, "the bot")
    .replace(/\bproject_[a-z0-9_-]+\b/gi, "the creation");
}

/**
 * The bot tags its final note with [[READY_TO_PLAY]] when the creation is
 * something the builder can open and play right now. We strip the tag out of the
 * kid-facing summary and use it to decide whether Bit should start a preview, so
 * the Play affordance only appears when the bot judged the build playable.
 */
export function extractReadyToPlay(botText: string): { readyToPlay: boolean; summary: string } {
  const readyToPlay = /\[\[\s*READY_TO_PLAY\s*\]\]/i.test(botText);
  const summary = botText.replace(/\[\[\s*READY_TO_PLAY\s*\]\]/gi, "").trim();
  return { readyToPlay, summary };
}

/** Builds the instruction Bit gets when a bot finishes. Only the playable,
 * completed case asks Bit to start a preview. */
export function buildCompletionPrompt(input: {
  outcome: "completed" | "cancelled" | "failed";
  projectId: string;
  title: string;
  /** Already run through kidSafeCompletionSummary. */
  summary: string;
  readyToPlay: boolean;
}): string {
  const { outcome, projectId, title, summary, readyToPlay } = input;
  if (outcome === "cancelled") {
    return `The build for "${title}" was stopped before finishing. Let the builder know gently in one short sentence.`;
  }
  if (outcome === "failed") {
    return `"${title}" hit a snag: ${summary}\n\nLet the builder know gently in one short sentence and offer to try again.`;
  }
  const base = `"${title}" is ready. What changed: ${summary}`;
  if (readyToPlay) {
    return `${base}\n\nIt is ready to open and play right now. Call start_preview with projectId "${projectId}" and the correct preview command for this creation, so a live preview is running, then warmly invite the builder to press Play, in one or two short sentences.`;
  }
  return `${base}\n\nTell the builder warmly that "${title}" is ready, in one or two short sentences.`;
}

export type { ChatMessage };
