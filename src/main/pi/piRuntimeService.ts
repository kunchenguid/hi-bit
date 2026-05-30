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
import type { ChatEvent } from "@shared/chat";
import type { RuntimeProject } from "../projects/projectService";
import { createGenerateImageTool } from "./imageGenTool";
import { chatEventsFromPiEvent } from "./piMessages";
import { createWorkerResourceLoader, HI_BIT_ACTIVE_TOOLS } from "./piResources";
import { createProcessSpriteTool } from "./processSpriteTool";

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
  /** Directory of bundled skills (e.g. create-2d-game, create-3d-game, game-assets) exposed to the worker. */
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
  /** Directory of bundled skills (e.g. create-2d-game, create-3d-game, game-assets) exposed to workers. */
  skillsDir?: string;
};

type RunningTurn = {
  turnId: string;
  session: RuntimePiSession;
  cancelled: boolean;
};

export class PiRuntimeService {
  private readonly sessions = new Map<string, RuntimePiSession>();
  private readonly running = new Map<string, RunningTurn>();
  private readonly createSession: (input: CreateRuntimeSessionInput) => Promise<RuntimePiSession>;
  private readonly modelId: string;
  private readonly customTools: ToolDefinition[];

  constructor(private readonly options: PiRuntimeServiceOptions) {
    this.modelId = options.modelId ?? "gpt-5.5";
    this.createSession = options.createSession ?? createRealPiSession;
    // Workers can draw real assets straight into their Workbench. generate_image pulls
    // a fresh Codex token per call so long builds don't fail on an expired session key;
    // process_sprite_sheet is a free local pass that turns a raw magenta sheet into a
    // game-ready transparent sprite sheet (see the game-assets skill).
    this.customTools = [
      createGenerateImageTool({
        getFreshAccessToken: options.getFreshAccessToken,
        model: this.modelId,
      }),
      createProcessSpriteTool(),
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
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.running.clear();
  }

  isRunning(projectId: string): boolean {
    return this.running.has(projectId);
  }

  private async getOrCreateSession(
    project: RuntimeProject,
    accessToken: string,
  ): Promise<RuntimePiSession> {
    const runtimeKey = runtimeKeyFor(project);
    const existing = this.sessions.get(runtimeKey);
    if (existing) return existing;
    const session = await this.createSession({
      project,
      accessToken,
      agentDir: this.options.agentDir,
      modelId: this.modelId,
      customTools: this.customTools,
      skillsDir: this.options.skillsDir,
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

  const resourceLoader = createWorkerResourceLoader(undefined, { skillsDir: input.skillsDir });
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
    // isn't listed is silently disabled. So the registered custom tools
    // (generate_image, process_sprite_sheet) MUST be named here, or the worker
    // never sees them and falls back to drawing art in code.
    tools: workerToolNames(input.customTools),
    customTools: input.customTools,
  });

  return new RealPiSessionAdapter(session, authStorage);
}

function runtimeKeyFor(project: RuntimeProject): string {
  return project.runtimeKey ?? project.id;
}

/**
 * The worker's tool allowlist: the built-in file tools plus every registered
 * custom tool by name. Pi's `tools` allowlist filters custom tools too, so the
 * custom tool names must be included or they stay invisible to the agent.
 */
export function workerToolNames(customTools: ToolDefinition[]): string[] {
  return [...HI_BIT_ACTIVE_TOOLS, ...customTools.map((tool) => tool.name)];
}
