import { randomUUID } from "node:crypto";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatEvent } from "@shared/chat";
import type { RuntimeProject } from "../projects/projectService";
import { chatEventsFromPiEvent } from "./piMessages";
import { createWorkerResourceLoader, HI_BIT_ACTIVE_TOOLS } from "./piResources";

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

  constructor(private readonly options: PiRuntimeServiceOptions) {
    this.modelId = options.modelId ?? "gpt-5.5";
    this.createSession = options.createSession ?? createRealPiSession;
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

  const resourceLoader = createWorkerResourceLoader();
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
    tools: [...HI_BIT_ACTIVE_TOOLS],
  });

  return new RealPiSessionAdapter(session, authStorage);
}

function runtimeKeyFor(project: RuntimeProject): string {
  return project.runtimeKey ?? project.id;
}
