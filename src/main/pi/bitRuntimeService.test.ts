import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { ChatEvent } from "@shared/chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BitPromptOptions,
  BitRuntimeService,
  type BitSession,
  type CreateBitSessionInput,
} from "./bitRuntimeService";

const piRuntime = vi.hoisted(() => {
  const agentSession = {
    sessionId: "real-bit-1",
    sessionFile: "/tmp/conversation/sessions/bit/real.jsonl",
    messages: [],
    sessionManager: { appendMessage: vi.fn() },
    subscribe: vi.fn(() => () => {}),
    prompt: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  const authStorage = { setRuntimeApiKey: vi.fn() };
  return { agentSession, authStorage, persistedMessages: [] as unknown[] };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    AuthStorage: { inMemory: vi.fn(() => piRuntime.authStorage) },
    ModelRegistry: {
      inMemory: vi.fn(() => ({ find: vi.fn(() => ({ id: "gpt-5.5" })) })),
    },
    SessionManager: {
      create: vi.fn(() => ({ kind: "created" })),
      open: vi.fn(() => ({ kind: "opened" })),
    },
    SettingsManager: { inMemory: vi.fn(() => ({ kind: "settings" })) },
    createAgentSession: vi.fn(async () => ({ session: piRuntime.agentSession })),
  };
});

class FakeBitSession implements BitSession {
  sessionId = "bit-1";
  sessionFile = "/tmp/conversation/sessions/bit/s1.jsonl";
  messages: unknown[] = [];
  accessTokens: string[] = [];
  promptTexts: string[] = [];
  promptOptions: BitPromptOptions[] = [];
  blockPrompt = false;
  private listeners: Array<(event: unknown) => void> = [];
  private unblock: (() => void) | undefined;

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  setAccessToken(accessToken: string): void {
    this.accessTokens.push(accessToken);
  }

  async prompt(_text: string, options?: BitPromptOptions): Promise<void> {
    this.promptTexts.push(_text);
    this.promptOptions.push(options ?? {});
    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "On it! " },
    });
    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "🐱" },
    });
    // Bit's own tool execution should not surface as chat activity.
    this.emit({ type: "tool_execution_start", toolCallId: "c1", toolName: "delegate_build" });
    if (this.blockPrompt) {
      await new Promise<void>((resolve) => {
        this.unblock = resolve;
      });
    }
  }

  async abort(): Promise<void> {}
  dispose(): void {
    this.unblock?.();
  }

  finishPrompt(): void {
    this.unblock?.();
  }

  private emit(event: unknown): void {
    for (const listener of this.listeners) listener(event);
  }
}

function baseInput() {
  return {
    profileId: "ada",
    profileRoot: "/tmp/profiles/ada",
    conversationDir: "/tmp/conversation",
    bitSessionsDir: "/tmp/conversation/sessions/bit",
    customTools: [],
  };
}

describe("BitRuntimeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    piRuntime.persistedMessages.length = 0;
    piRuntime.agentSession.sessionManager.appendMessage = vi.fn((message: unknown) => {
      piRuntime.persistedMessages.push(message);
    });
  });

  it("streams assistant text as profile-routed events and returns the accumulated reply", async () => {
    const session = new FakeBitSession();
    const sessionFiles: Array<string | undefined> = [];
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (_input: CreateBitSessionInput) => session,
      onSessionFile: (_profileId, file) => {
        sessionFiles.push(file);
      },
    });

    const events: ChatEvent[] = [];
    const result = await service.prompt(baseInput(), "make a cat game", (event) =>
      events.push(event),
    );

    expect(result.status).toBe("completed");
    expect(result.assistantText).toBe("On it! 🐱");
    expect(session.accessTokens).toEqual(["token-1"]);
    expect(sessionFiles).toEqual(["/tmp/conversation/sessions/bit/s1.jsonl"]);

    expect(events.map((event) => event.type)).toEqual([
      "turn_start",
      "assistant_delta",
      "assistant_delta",
      "turn_end",
    ]);
    for (const event of events) {
      expect(event.profileId).toBe("ada");
      expect((event as { projectId?: string }).projectId).toBeUndefined();
    }
  });

  it("gives Bit the view_bit brand tool when a mascot asset path is configured", async () => {
    let captured: CreateBitSessionInput | undefined;
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      mascotAssetPath: "/tmp/brand/mascot-boo.svg",
      createSession: async (input: CreateBitSessionInput) => {
        captured = input;
        return new FakeBitSession();
      },
    });

    await service.prompt(baseInput(), "what do you look like?", () => {});

    expect((captured?.customTools ?? []).map((tool) => tool.name)).toContain("view_bit");
  });

  it("omits view_bit when no mascot asset path is configured", async () => {
    let captured: CreateBitSessionInput | undefined;
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (input: CreateBitSessionInput) => {
        captured = input;
        return new FakeBitSession();
      },
    });

    await service.prompt(baseInput(), "hi", () => {});

    expect((captured?.customTools ?? []).map((tool) => tool.name)).not.toContain("view_bit");
  });

  it("forwards an attached picture to the session prompt", async () => {
    const session = new FakeBitSession();
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (_input: CreateBitSessionInput) => session,
    });

    await service.prompt(baseInput(), "what is this?", () => {}, {
      images: [
        {
          type: "image",
          path: "/tmp/profiles/ada/conversation/attachments/cat.png",
          mimeType: "image/png",
        },
      ],
    });

    expect(session.promptOptions.at(-1)?.images).toEqual([
      {
        type: "image",
        path: "/tmp/profiles/ada/conversation/attachments/cat.png",
        mimeType: "image/png",
      },
    ]);
  });

  it("does not pass inline image bytes into the session prompt", async () => {
    const session = new FakeBitSession();
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (_input: CreateBitSessionInput) => session,
    });

    await service.prompt(baseInput(), "what is this?", () => {}, {
      images: [
        {
          type: "image",
          path: "/tmp/profiles/ada/conversation/attachments/cat.png",
          data: "AAABBB",
          mimeType: "image/png",
        },
      ],
    });

    expect(JSON.stringify(session.promptOptions.at(-1))).not.toContain("AAABBB");
  });

  it("passes attached image bytes to the production Pi session prompt", async () => {
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
    });

    await service.prompt(baseInput(), "what is this?", () => {}, {
      images: [
        {
          type: "image",
          path: "/tmp/profiles/ada/conversation/attachments/cat.png",
          data: "AAABBB",
          mimeType: "image/png",
        },
      ],
    });

    expect(piRuntime.agentSession.prompt).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/profiles/ada/conversation/attachments/cat.png"),
      {
        source: "rpc",
        images: [{ type: "image", data: "AAABBB", mimeType: "image/png" }],
      },
    );

    piRuntime.agentSession.sessionManager.appendMessage({
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image", data: "AAABBB", mimeType: "image/png" },
      ],
    });

    expect(JSON.stringify(piRuntime.persistedMessages.at(-1))).not.toContain("AAABBB");
  });

  it("passes the configured thinking level to the production Pi session", async () => {
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      thinkingLevel: "high",
    });

    await service.prompt(baseInput(), "hi", () => {});

    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ thinkingLevel: "high" }),
    );
  });

  it("defaults to balanced thinking when no level is configured", async () => {
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
    });

    await service.prompt(baseInput(), "hi", () => {});

    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ thinkingLevel: "medium" }),
    );
  });

  it("rebuilds idle Bit sessions at the new effort after setThinkingLevel", async () => {
    const levels: string[] = [];
    const disposed: string[] = [];
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (input: CreateBitSessionInput) => {
        levels.push(input.thinkingLevel);
        const session = new FakeBitSession();
        session.dispose = () => disposed.push(input.thinkingLevel);
        return session;
      },
    });

    await service.prompt(baseInput(), "first", () => {});
    service.setThinkingLevel("xhigh");
    await service.prompt(baseInput(), "second", () => {});

    expect(levels).toEqual(["medium", "xhigh"]);
    expect(disposed).toEqual(["medium"]);
  });

  it("rebuilds a running Bit session after setThinkingLevel once the turn finishes", async () => {
    const levels: string[] = [];
    const disposed: string[] = [];
    const sessions: FakeBitSession[] = [];
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (input: CreateBitSessionInput) => {
        levels.push(input.thinkingLevel);
        const session = new FakeBitSession();
        session.blockPrompt = sessions.length === 0;
        session.dispose = () => disposed.push(input.thinkingLevel);
        sessions.push(session);
        return session;
      },
    });

    const firstPrompt = service.prompt(baseInput(), "first", () => {});
    await vi.waitFor(() => expect(service.isRunning("ada")).toBe(true));
    service.setThinkingLevel("xhigh");
    sessions[0].finishPrompt();
    await firstPrompt;
    sessions[0].blockPrompt = false;
    await service.prompt(baseInput(), "second", () => {});

    expect(levels).toEqual(["medium", "xhigh"]);
    expect(disposed).toEqual(["medium"]);
  });

  it("rebuilds a Bit session when thinking changes while the session is being created", async () => {
    const levels: string[] = [];
    const disposed: string[] = [];
    const sessions: FakeBitSession[] = [];
    let resolveCreate: (() => void) | undefined;
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (input: CreateBitSessionInput) => {
        levels.push(input.thinkingLevel);
        if (sessions.length === 0) {
          await new Promise<void>((resume) => {
            resolveCreate = resume;
          });
        }
        const session = new FakeBitSession();
        session.dispose = () => disposed.push(input.thinkingLevel);
        sessions.push(session);
        return session;
      },
    });

    const firstPrompt = service.prompt(baseInput(), "first", () => {});
    await vi.waitFor(() => expect(levels).toEqual(["medium"]));
    service.setThinkingLevel("xhigh");
    resolveCreate?.();
    await firstPrompt;
    await service.prompt(baseInput(), "second", () => {});

    expect(sessions).toHaveLength(2);
    expect(levels).toEqual(["medium", "xhigh"]);
    expect(disposed).toEqual(["medium"]);
  });

  it("gives Bit the app and browser tools when their surfaces are configured", async () => {
    let captured: CreateBitSessionInput | undefined;
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      appSurface: {
        screenshot: async () => "PNGBYTES",
        snapshotChrome: async () => "",
        highlight: async () => true,
        clearHighlight: async () => {},
      },
      browserHost: {
        openTab: async () => ({ id: "t1", url: "", kind: "web" }),
        closeTab: async () => {},
        listTabs: async () => [],
        switchTab: async () => {},
        navigate: async () => {},
        back: async () => {},
        reload: async () => {},
        snapshot: async () => "",
        click: async () => {},
        fill: async () => {},
        type: async () => {},
        press: async () => {},
        scroll: async () => {},
        read: async () => "",
        screenshot: async () => null,
        console: async () => [],
      },
      createSession: async (input: CreateBitSessionInput) => {
        captured = input;
        return new FakeBitSession();
      },
    });

    await service.prompt(baseInput(), "why does this button look weird?", () => {});

    const names = (captured?.customTools ?? []).map((tool) => tool.name);
    expect(names).toContain("app_screenshot");
    expect(names).toContain("app_highlight");
    expect(names).toContain("browser_open_tab");
    expect(names).toContain("browser_click");
  });

  it("omits app and browser tools when no surfaces are configured", async () => {
    let captured: CreateBitSessionInput | undefined;
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (input: CreateBitSessionInput) => {
        captured = input;
        return new FakeBitSession();
      },
    });

    await service.prompt(baseInput(), "hi", () => {});

    const names = (captured?.customTools ?? []).map((tool) => tool.name);
    expect(names).not.toContain("app_screenshot");
    expect(names).not.toContain("browser_open_tab");
  });

  it("gives Bit the web lookup tools alongside its delegation tools", async () => {
    let captured: CreateBitSessionInput | undefined;
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async (input: CreateBitSessionInput) => {
        captured = input;
        return new FakeBitSession();
      },
    });

    await service.prompt(baseInput(), "what's the latest on three.js?", () => {});

    const toolNames = (captured?.customTools ?? []).map((tool) => tool.name);
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("fetch_content");
    expect(toolNames).toContain("get_search_content");
  });

  it("reuses one session per profile across turns", async () => {
    const sessions: FakeBitSession[] = [];
    const service = new BitRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async () => {
        const session = new FakeBitSession();
        sessions.push(session);
        return session;
      },
    });

    await service.prompt(baseInput(), "first", () => {});
    await service.prompt(baseInput(), "second", () => {});

    expect(sessions).toHaveLength(1);
  });
});
