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
import { createMayorResourceLoader } from "./piResources";

export type MayorSession = {
  sessionId: string;
  sessionFile?: string;
  messages: unknown[];
  subscribe: (listener: (event: unknown) => void) => () => void;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  setAccessToken?: (accessToken: string) => void;
};

export type MayorPromptInput = {
  profileId: string;
  conversationDir: string;
  mayorSessionsDir: string;
  sessionFile?: string;
  customTools: ToolDefinition[];
};

export type CreateMayorSessionInput = MayorPromptInput & {
  accessToken: string;
  agentDir: string;
  modelId: string;
};

export type MayorTurnResult = {
  turnId: string;
  status: "completed" | "cancelled" | "failed";
  assistantText: string;
  sessionFile?: string;
  error?: string;
};

export type MayorRuntime = {
  prompt(
    input: MayorPromptInput,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<MayorTurnResult>;
  abort(profileId: string): Promise<void>;
  isRunning(profileId: string): boolean;
  dispose(profileId: string): void;
  disposeAll(): void;
};

type MayorRuntimeServiceOptions = {
  agentDir: string;
  modelId?: string;
  getFreshAccessToken: () => Promise<string>;
  createSession?: (input: CreateMayorSessionInput) => Promise<MayorSession>;
  onSessionFile?: (profileId: string, sessionFile: string | undefined) => Promise<void> | void;
};

type RunningTurn = {
  turnId: string;
  session: MayorSession;
  cancelled: boolean;
};

/**
 * Runs the per-profile Bit/Mayor Pi session. One persistent session per profile,
 * created with the custom delegation tools and no built-in coding tools. Maps the
 * session's assistant text into profile-routed ChatEvents; the Mayor's own tool
 * calls (delegation) are intentionally not surfaced as chat activity.
 */
export class MayorRuntimeService implements MayorRuntime {
  private readonly sessions = new Map<string, MayorSession>();
  private readonly running = new Map<string, RunningTurn>();
  private readonly createSession: (input: CreateMayorSessionInput) => Promise<MayorSession>;
  private readonly modelId: string;

  constructor(private readonly options: MayorRuntimeServiceOptions) {
    this.modelId = options.modelId ?? "gpt-5.5";
    this.createSession = options.createSession ?? createRealMayorSession;
  }

  async prompt(
    input: MayorPromptInput,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<MayorTurnResult> {
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

    let status: MayorTurnResult["status"] = "completed";
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
    input: MayorPromptInput,
    accessToken: string,
  ): Promise<MayorSession> {
    const existing = this.sessions.get(input.profileId);
    if (existing) return existing;
    const session = await this.createSession({
      ...input,
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

class RealMayorSessionAdapter implements MayorSession {
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

async function createRealMayorSession(input: CreateMayorSessionInput): Promise<MayorSession> {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("openai-codex", input.accessToken);
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = modelRegistry.find("openai-codex", input.modelId);
  if (!model) {
    throw new Error(`Codex model not found: openai-codex/${input.modelId}`);
  }

  const sessionManager = input.sessionFile
    ? SessionManager.open(input.sessionFile, input.mayorSessionsDir, input.conversationDir)
    : SessionManager.create(input.conversationDir, input.mayorSessionsDir);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
    enableInstallTelemetry: false,
  });

  const resourceLoader = createMayorResourceLoader();
  await resourceLoader.reload();

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
    customTools: input.customTools,
  });

  return new RealMayorSessionAdapter(session, authStorage);
}
