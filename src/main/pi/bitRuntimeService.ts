import { randomUUID } from "node:crypto";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  type PromptOptions,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ChatEvent } from "@shared/chat";
import type { BrowserHost } from "../control/browserHost";
import { type AppSurface, createAppTools } from "./appTools";
import { createViewBitTool } from "./brandTool";
import { createBrowserTools } from "./browserTools";
import { createBitResourceLoader } from "./piResources";
import { createProfileTools, type ProfileDirectMutation } from "./profileJailedTools";
import { createWebSearchTools } from "./webSearchTools";

/** A picture handed to the model with a prompt, in the Pi runtime's content shape. */
export type BitPromptImage = { type: "image"; path: string; mimeType: string; data?: string };

export type BitPromptOptions = { images?: BitPromptImage[] };

export type BitSession = {
  sessionId: string;
  sessionFile?: string;
  messages: unknown[];
  supportsInlineImages?: boolean;
  subscribe: (listener: (event: unknown) => void) => () => void;
  prompt: (text: string, options?: BitPromptOptions) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  setAccessToken?: (accessToken: string) => void;
};

export type BitPromptInput = {
  profileId: string;
  /** The kid's profile directory - jail root for Bit's explorer and tiny-edit tools. */
  profileRoot: string;
  conversationDir: string;
  bitSessionsDir: string;
  sessionFile?: string;
  customTools: ToolDefinition[];
  onProfileMutation?: (mutation: ProfileDirectMutation) => Promise<void> | void;
};

export type CreateBitSessionInput = BitPromptInput & {
  accessToken: string;
  agentDir: string;
  modelId: string;
};

export type BitTurnResult = {
  turnId: string;
  status: "completed" | "cancelled" | "failed";
  assistantText: string;
  sessionFile?: string;
  error?: string;
};

export type BitRuntime = {
  prompt(
    input: BitPromptInput,
    text: string,
    onEvent: (event: ChatEvent) => void,
    options?: BitPromptOptions,
  ): Promise<BitTurnResult>;
  abort(profileId: string): Promise<void>;
  isRunning(profileId: string): boolean;
  dispose(profileId: string): void;
  disposeAll(): void;
};

type BitRuntimeServiceOptions = {
  agentDir: string;
  modelId?: string;
  getFreshAccessToken: () => Promise<string>;
  createSession?: (input: CreateBitSessionInput) => Promise<BitSession>;
  onSessionFile?: (profileId: string, sessionFile: string | undefined) => Promise<void> | void;
  /** Path to Bit's mascot SVG, so Bit can `view_bit` to see its own look. */
  mascotAssetPath?: string;
  /**
   * Backs Bit's `app_*` tools (screenshot/snapshot/spotlight). Omitted in tests,
   * so those tools are absent.
   */
  appSurface?: AppSurface;
  /**
   * Backs Bit's `browser_*` tools (visible tabs). Omitted in tests, so those
   * tools are absent.
   */
  browserHost?: BrowserHost;
};

type RunningTurn = {
  turnId: string;
  session: BitSession;
  cancelled: boolean;
};

/**
 * Runs the per-profile Bit Pi session. One persistent session per profile,
 * created with custom delegation tools, jailed profile tools, and no built-in
 * coding tools. Maps the session's assistant text into profile-routed
 * ChatEvents; Bit's own tool calls are intentionally not surfaced as chat
 * activity.
 */
export class BitRuntimeService implements BitRuntime {
  private readonly sessions = new Map<string, BitSession>();
  private readonly running = new Map<string, RunningTurn>();
  private readonly createSession: (input: CreateBitSessionInput) => Promise<BitSession>;
  private readonly modelId: string;
  /**
   * Web lookup tools (web_search/fetch_content/get_search_content), the same set
   * bots get. Built once on Hi-Bit's Codex login so Bit can look things up while
   * coordinating, instead of having to delegate every lookup to a bot.
   */
  private readonly webTools: ToolDefinition[];
  /**
   * Bit's own self-portrait tool (`view_bit`), so Bit can actually look at its
   * mascot when the builder asks what it looks like. Empty when no mascot asset
   * path is configured (e.g. in tests).
   */
  private readonly brandTools: ToolDefinition[];
  /**
   * Bit's app tools (`app_screenshot`/`app_snapshot`/`app_highlight`): see the
   * whole renderer and spotlight controls for the kid, but never click them.
   * Empty when no app surface is configured (e.g. tests).
   */
  private readonly appTools: ToolDefinition[];
  /**
   * Bit's browser tools (`browser_*`): open and operate visible tabs - creations
   * and allowed websites. Empty when no browser host is configured (e.g. tests).
   */
  private readonly browserTools: ToolDefinition[];

  constructor(private readonly options: BitRuntimeServiceOptions) {
    this.modelId = options.modelId ?? "gpt-5.5";
    this.createSession = options.createSession ?? createRealBitSession;
    this.webTools = createWebSearchTools({
      getFreshAccessToken: options.getFreshAccessToken,
      model: this.modelId,
    });
    this.brandTools = options.mascotAssetPath
      ? [createViewBitTool({ mascotSvgPath: options.mascotAssetPath })]
      : [];
    this.appTools = options.appSurface ? createAppTools(options.appSurface) : [];
    this.browserTools = options.browserHost ? createBrowserTools(options.browserHost) : [];
  }

  async prompt(
    input: BitPromptInput,
    text: string,
    onEvent: (event: ChatEvent) => void,
    options?: BitPromptOptions,
  ): Promise<BitTurnResult> {
    const { profileId } = input;
    if (this.running.has(profileId)) {
      throw new Error("Bit is already replying.");
    }

    const accessToken = await this.options.getFreshAccessToken();
    const session = await this.getOrCreateSession(input, accessToken);
    session.setAccessToken?.(accessToken);

    const turnId = randomUUID();
    const running: RunningTurn = { turnId, session, cancelled: false };
    this.running.set(profileId, running);
    onEvent({ type: "turn_start", profileId, turnId });

    let assistantText = "";
    const unsubscribe = session.subscribe((event) => {
      const delta = assistantDeltaFromPiEvent(event);
      if (delta) {
        assistantText += delta;
        onEvent({ type: "assistant_delta", profileId, turnId, text: delta });
      }
    });

    let status: BitTurnResult["status"] = "completed";
    let error: string | undefined;
    try {
      const promptOptions = session.supportsInlineImages
        ? options
        : promptOptionsWithoutInlineImageData(options);
      await session.prompt(promptTextWithImagePaths(text, promptOptions?.images), promptOptions);
      if (running.cancelled) status = "cancelled";
    } catch (caught) {
      if (running.cancelled) {
        status = "cancelled";
      } else {
        status = "failed";
        error = caught instanceof Error ? caught.message : String(caught);
      }
    } finally {
      unsubscribe();
      this.running.delete(profileId);
    }

    await this.options.onSessionFile?.(profileId, session.sessionFile);
    onEvent({ type: "turn_end", profileId, turnId, status, error });
    return { turnId, status, assistantText, sessionFile: session.sessionFile, error };
  }

  async abort(profileId: string): Promise<void> {
    const running = this.running.get(profileId);
    if (!running) return;
    running.cancelled = true;
    await running.session.abort();
  }

  isRunning(profileId: string): boolean {
    return this.running.has(profileId);
  }

  dispose(profileId: string): void {
    this.sessions.get(profileId)?.dispose();
    this.sessions.delete(profileId);
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.running.clear();
  }

  private async getOrCreateSession(
    input: BitPromptInput,
    accessToken: string,
  ): Promise<BitSession> {
    const existing = this.sessions.get(input.profileId);
    if (existing) return existing;
    const session = await this.createSession({
      ...input,
      customTools: [
        ...input.customTools,
        ...this.webTools,
        ...this.brandTools,
        ...this.appTools,
        ...this.browserTools,
      ],
      accessToken,
      agentDir: this.options.agentDir,
      modelId: this.modelId,
    });
    this.sessions.set(input.profileId, session);
    return session;
  }
}

function assistantDeltaFromPiEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const typed = event as Record<string, unknown>;
  if (typed.type !== "message_update") return null;
  const assistantMessageEvent = typed.assistantMessageEvent as Record<string, unknown> | undefined;
  if (
    assistantMessageEvent?.type !== "text_delta" ||
    typeof assistantMessageEvent.delta !== "string"
  ) {
    return null;
  }
  return assistantMessageEvent.delta;
}

class RealBitSessionAdapter implements BitSession {
  readonly supportsInlineImages = true;

  constructor(
    private readonly session: AgentSession,
    private readonly authStorage: AuthStorage,
  ) {
    scrubInlineImagesFromSessionPersistence(session);
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  get sessionFile(): string | undefined {
    return this.session.sessionFile;
  }

  get messages(): unknown[] {
    return this.session.messages;
  }

  subscribe(listener: (event: unknown) => void): () => void {
    return this.session.subscribe(listener);
  }

  prompt(text: string, options?: BitPromptOptions): Promise<void> {
    return this.session.prompt(text, promptOptionsForPiSession(options));
  }

  abort(): Promise<void> {
    return this.session.abort();
  }

  dispose(): void {
    this.session.dispose();
  }

  setAccessToken(accessToken: string): void {
    this.authStorage.setRuntimeApiKey("openai-codex", accessToken);
  }
}

function promptOptionsWithoutInlineImageData(
  options?: BitPromptOptions,
): BitPromptOptions | undefined {
  if (!options?.images?.length) return undefined;
  return {
    images: options.images.map((image) => ({
      type: image.type,
      path: image.path,
      mimeType: image.mimeType,
    })),
  };
}

function promptOptionsForPiSession(options?: BitPromptOptions): PromptOptions {
  const images = options?.images
    ?.filter((image) => typeof image.data === "string" && image.data.length > 0)
    .map((image) => ({ type: image.type, data: image.data as string, mimeType: image.mimeType }));
  return images?.length ? { source: "rpc", images } : { source: "rpc" };
}

function scrubInlineImagesFromSessionPersistence(session: AgentSession): void {
  const appendMessage = session.sessionManager.appendMessage.bind(session.sessionManager);
  session.sessionManager.appendMessage = (message) => {
    const scrubbed = scrubInlineImageData(message) as Parameters<typeof appendMessage>[0];
    return appendMessage(scrubbed);
  };
}

function scrubInlineImageData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => scrubInlineImageData(item));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.type === "image" && typeof record.data === "string") {
    return { type: "text", text: "Attached image omitted from saved session." };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, scrubInlineImageData(entry)]),
  );
}

function promptTextWithImagePaths(text: string, images?: BitPromptImage[]): string {
  if (!images?.length) return text;
  const paths = images.map((image) => image.path).join("\n");
  return `${text}\n\nAttached image file:\n${paths}`;
}

async function createRealBitSession(input: CreateBitSessionInput): Promise<BitSession> {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("openai-codex", input.accessToken);
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = modelRegistry.find("openai-codex", input.modelId);
  if (!model) {
    throw new Error(`Codex model not found: openai-codex/${input.modelId}`);
  }

  const sessionManager = input.sessionFile
    ? SessionManager.open(input.sessionFile, input.bitSessionsDir, input.conversationDir)
    : SessionManager.create(input.conversationDir, input.bitSessionsDir);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
    enableInstallTelemetry: false,
  });

  const resourceLoader = createBitResourceLoader();
  await resourceLoader.reload();

  // Bit gets the delegation tools plus read/write/edit/explorer tools confined
  // to the kid's profile, so it can make tiny direct fixes and still delegate
  // anything bigger. noTools:"builtin" keeps the unguarded built-in file tools
  // (and bash) off, so these jailed tools are Bit's only path to disk.
  const jailedTools = createProfileTools(input.profileRoot, {
    onMutation: input.onProfileMutation,
  });

  const { session } = await createAgentSession({
    cwd: input.conversationDir,
    agentDir: input.agentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: "medium",
    resourceLoader,
    sessionManager,
    settingsManager,
    noTools: "builtin",
    customTools: [...input.customTools, ...jailedTools],
  });

  return new RealBitSessionAdapter(session, authStorage);
}
