import { randomUUID } from "node:crypto";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ChatEvent, ImageReference } from "@shared/chat";
import type { HeadlessBrowserHost } from "../control/headlessBrowser";
import type { ImageStore } from "../conversation/conversationService";
import type { RuntimeProject } from "../projects/projectService";
import { createViewBitTool } from "./brandTool";
import { createBrowserTools } from "./browserTools";
import { createGenerateImageTool } from "./imageGenTool";
import { chatEventsFromPiEvent } from "./piMessages";
import { createBotResourceLoader, HI_BIT_ACTIVE_TOOLS } from "./piResources";
import { createProcessSpriteTool } from "./processSpriteTool";
import { createWebSearchTools } from "./webSearchTools";

export type RuntimePiSession = {
  sessionId: string;
  sessionFile?: string;
  messages: unknown[];
  subscribe: (listener: (event: unknown) => void) => () => void;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  setAccessToken?: (accessToken: string) => void;
};

export type CreateRuntimeSessionInput = {
  project: RuntimeProject;
  accessToken: string;
  agentDir: string;
  modelId: string;
  customTools: ToolDefinition[];
  /** Directory of bundled skills (e.g. create-2d-game, create-3d-game, game-assets) exposed to the bot. */
  skillsDir?: string;
};

export type SendPromptResult = {
  turnId: string;
  status: "completed" | "cancelled" | "failed";
  sessionFile?: string;
  error?: string;
};

type PiRuntimeServiceOptions = {
  agentDir: string;
  modelId?: string;
  getFreshAccessToken: () => Promise<string>;
  createSession?: (input: CreateRuntimeSessionInput) => Promise<RuntimePiSession>;
  onSessionFile?: (projectId: string, sessionFile: string | undefined) => Promise<void> | void;
  /** Directory of bundled skills (e.g. create-2d-game, create-3d-game, game-assets) exposed to bots. */
  skillsDir?: string;
  /** Path to Bit's mascot SVG, so the bot can `view_bit` to draw Bit on-model. */
  mascotAssetPath?: string;
  /**
   * Makes a fresh headless browser for a bot session, so bots get the `browser_*`
   * tools over offscreen windows (never the kid's screen, never the `app_*`
   * tools). Omitted in tests, so bots have no browser there.
   */
  createBrowser?: () => HeadlessBrowserHost;
  /**
   * The profile's image store, so a bot's `search_image`/`generate_image` results
   * are persisted with reusable ids and any stored id resolves as a reference.
   * Omitted in tests, where pictures stay in-creation only.
   */
  imageStore?: ImageStore;
};

type RunningTurn = {
  turnId: string;
  session: RuntimePiSession;
  cancelled: boolean;
};

export class PiRuntimeService {
  private readonly sessions = new Map<string, RuntimePiSession>();
  private readonly running = new Map<string, RunningTurn>();
  /** One headless browser per bot session, torn down with the session. */
  private readonly browsers = new Map<string, HeadlessBrowserHost>();
  /**
   * The builder's reference pictures for the turn currently running in a given
   * Workbench (keyed by cwd), so generate_image can resolve a reference id to the
   * factory-level file. Set per turn and cleared when it ends, so a reference
   * never leaks to a later, unrelated job.
   */
  private readonly jobReferences = new Map<string, ImageReference[]>();
  /**
   * The profile that owns the turn running in a given Workbench (keyed by cwd),
   * so a picture-saving tool can route its bytes to the right profile's store and
   * a store-backed reference can resolve. Set/cleared with `jobReferences`.
   */
  private readonly jobProfiles = new Map<string, string>();
  private readonly createSession: (input: CreateRuntimeSessionInput) => Promise<RuntimePiSession>;
  private readonly modelId: string;
  private readonly customTools: ToolDefinition[];

  constructor(private readonly options: PiRuntimeServiceOptions) {
    this.modelId = options.modelId ?? "gpt-5.5";
    this.createSession = options.createSession ?? createRealPiSession;
    // Bots can draw real assets straight into their Workbench. generate_image pulls
    // a fresh Codex token per call so long builds don't fail on an expired session key;
    // process_sprite_sheet is a free local pass that turns a raw magenta sheet into a
    // game-ready transparent sprite sheet (see the game-assets skill). The web tools let
    // a bot look up current docs/examples: web_search runs on the same Codex backend
    // and token as generate_image, fetch_content reads a page locally - their names flow
    // into the allowlist through botToolNames().
    const persistImage = options.imageStore
      ? async (cwd: string, input: Parameters<ImageStore["saveImage"]>[1]) => {
          const profileId = this.jobProfiles.get(cwd);
          if (!profileId) return undefined;
          return options.imageStore?.saveImage(profileId, input);
        }
      : undefined;
    this.customTools = [
      createGenerateImageTool({
        getFreshAccessToken: options.getFreshAccessToken,
        model: this.modelId,
        resolveReference: (cwd, ref) => this.resolveJobReference(cwd, ref),
        persistImage,
      }),
      createProcessSpriteTool(),
      ...createWebSearchTools({
        getFreshAccessToken: options.getFreshAccessToken,
        model: this.modelId,
        persistImage,
      }),
      // Lets a bot see Bit's actual mascot before drawing Bit or Bit-branded art,
      // so a "put Bit in my game" build stays on-model. Its name flows into the
      // allowlist through botToolNames().
      ...(options.mascotAssetPath
        ? [createViewBitTool({ mascotSvgPath: options.mascotAssetPath })]
        : []),
    ];
  }

  async sendPrompt(
    project: RuntimeProject,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<SendPromptResult> {
    const runtimeKey = runtimeKeyFor(project);
    if (this.running.has(runtimeKey)) {
      throw new Error("Bit is already working on this project.");
    }

    const accessToken = await this.options.getFreshAccessToken();
    const session = await this.getOrCreateSession(project, accessToken);
    session.setAccessToken?.(accessToken);

    const turnId = randomUUID();
    const meta = {
      profileId: project.profileId,
      projectId: project.id,
      projectTitle: project.title,
      turnId,
    };
    const running: RunningTurn = { turnId, session, cancelled: false };
    this.running.set(runtimeKey, running);
    // Make the builder's reference pictures resolvable for generate_image while
    // this turn runs, keyed by the Workbench cwd the tool sees.
    if (project.references?.length) {
      this.jobReferences.set(project.mainWorkbenchDir, project.references);
    }
    // Route this Workbench's picture saves and store-backed reference lookups to
    // the profile that owns the turn.
    this.jobProfiles.set(project.mainWorkbenchDir, project.profileId);
    onEvent({ type: "turn_start", ...meta });

    const unsubscribe = session.subscribe((event) => {
      for (const chatEvent of chatEventsFromPiEvent(event, meta)) {
        onEvent(chatEvent);
      }
    });

    let status: SendPromptResult["status"] = "completed";
    let error: string | undefined;
    try {
      await session.prompt(text);
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
      this.running.delete(runtimeKey);
      this.jobReferences.delete(project.mainWorkbenchDir);
      this.jobProfiles.delete(project.mainWorkbenchDir);
    }

    const result: SendPromptResult = { turnId, status, sessionFile: session.sessionFile, error };
    await this.options.onSessionFile?.(project.id, session.sessionFile);
    onEvent({ type: "turn_end", ...meta, status, error });
    return result;
  }

  async abort(projectId: string): Promise<void> {
    const running = this.running.get(projectId);
    if (!running) return;
    running.cancelled = true;
    await running.session.abort();
  }

  getMessages(projectId: string): unknown[] {
    return this.sessions.get(projectId)?.messages ?? [];
  }

  disposeProject(projectId: string): void {
    this.sessions.get(projectId)?.dispose();
    this.sessions.delete(projectId);
    this.browsers.get(projectId)?.dispose();
    this.browsers.delete(projectId);
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    for (const browser of this.browsers.values()) {
      browser.dispose();
    }
    this.sessions.clear();
    this.browsers.clear();
    this.running.clear();
    this.jobReferences.clear();
    this.jobProfiles.clear();
  }

  isRunning(projectId: string): boolean {
    return this.running.has(projectId);
  }

  /**
   * Resolves a generate_image `reference_paths` entry that names a stored picture
   * id for the turn running in `cwd`. The builder's per-turn pictures take
   * precedence (in-memory, set on the blueprint); otherwise it falls through to
   * the profile's image store, so any stored id resolves - including art the bot
   * just found/made, or made in another creation. Returns undefined for anything
   * unknown, so the tool reads it as a Workbench path.
   */
  async resolveJobReference(
    cwd: string,
    ref: string,
  ): Promise<{ path: string; mimeType: string } | undefined> {
    const match = this.jobReferences.get(cwd)?.find((reference) => reference.id === ref);
    if (match) return { path: match.path, mimeType: match.mimeType };
    const profileId = this.jobProfiles.get(cwd);
    if (profileId && this.options.imageStore) {
      return this.options.imageStore.resolveImageFile(profileId, ref);
    }
    return undefined;
  }

  private async getOrCreateSession(
    project: RuntimeProject,
    accessToken: string,
  ): Promise<RuntimePiSession> {
    const runtimeKey = runtimeKeyFor(project);
    const existing = this.sessions.get(runtimeKey);
    if (existing) return existing;
    // A bot gets its own headless browser (and the browser_* tools over it) for
    // this session; it never sees the kid's screen or the app_* tools.
    let customTools = this.customTools;
    let browser: HeadlessBrowserHost | undefined;
    if (this.options.createBrowser) {
      browser = this.options.createBrowser();
      this.browsers.set(runtimeKey, browser);
      customTools = [...this.customTools, ...createBrowserTools(browser)];
    }
    const session = await this.createSession({
      project,
      accessToken,
      agentDir: this.options.agentDir,
      modelId: this.modelId,
      customTools,
      skillsDir: this.options.skillsDir,
    }).catch((error) => {
      browser?.dispose();
      this.browsers.delete(runtimeKey);
      throw error;
    });
    this.sessions.set(runtimeKey, session);
    return session;
  }
}

class RealPiSessionAdapter implements RuntimePiSession {
  constructor(
    private readonly session: AgentSession,
    private readonly authStorage: AuthStorage,
  ) {}

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

  prompt(text: string): Promise<void> {
    return this.session.prompt(text, { source: "rpc" });
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

async function createRealPiSession(input: CreateRuntimeSessionInput): Promise<RuntimePiSession> {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("openai-codex", input.accessToken);
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = modelRegistry.find("openai-codex", input.modelId);
  if (!model) {
    throw new Error(`Codex model not found: openai-codex/${input.modelId}`);
  }

  const sessionManager = input.project.activeBitSessionFile
    ? SessionManager.open(
        input.project.activeBitSessionFile,
        input.project.bitSessionsDir,
        input.project.mainWorkbenchDir,
      )
    : SessionManager.create(input.project.mainWorkbenchDir, input.project.bitSessionsDir);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
    enableInstallTelemetry: false,
  });

  const resourceLoader = createBotResourceLoader(undefined, { skillsDir: input.skillsDir });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: input.project.mainWorkbenchDir,
    agentDir: input.agentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: "medium",
    resourceLoader,
    sessionManager,
    settingsManager,
    // The `tools` allowlist gates custom tools too: any custom tool whose name
    // isn't listed is silently disabled. So every registered custom tool MUST be
    // named here, or the bot never sees art, sprite-processing, or web tools.
    tools: botToolNames(input.customTools),
    customTools: input.customTools,
  });

  return new RealPiSessionAdapter(session, authStorage);
}

function runtimeKeyFor(project: RuntimeProject): string {
  return project.runtimeKey ?? project.id;
}

/**
 * The bot's tool allowlist: the built-in file tools plus every registered
 * custom tool by name. Pi's `tools` allowlist filters custom tools too, so the
 * custom tool names must be included or they stay invisible to the agent.
 */
export function botToolNames(customTools: ToolDefinition[]): string[] {
  return [...HI_BIT_ACTIVE_TOOLS, ...customTools.map((tool) => tool.name)];
}
