import type { ChatEvent } from "@shared/chat";
import { describe, expect, it } from "vitest";
import {
  type BitPromptOptions,
  BitRuntimeService,
  type BitSession,
  type CreateBitSessionInput,
} from "./bitRuntimeService";

class FakeBitSession implements BitSession {
  sessionId = "bit-1";
  sessionFile = "/tmp/conversation/sessions/bit/s1.jsonl";
  messages: unknown[] = [];
  accessTokens: string[] = [];
  promptTexts: string[] = [];
  promptOptions: BitPromptOptions[] = [];
  private listeners: Array<(event: unknown) => void> = [];

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
  }

  async abort(): Promise<void> {}
  dispose(): void {}

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
