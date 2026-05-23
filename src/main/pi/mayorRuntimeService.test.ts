import type { ChatEvent } from "@shared/chat";
import { describe, expect, it } from "vitest";
import {
  type CreateMayorSessionInput,
  MayorRuntimeService,
  type MayorSession,
} from "./mayorRuntimeService";

class FakeMayorSession implements MayorSession {
  sessionId = "mayor-1";
  sessionFile = "/tmp/conversation/sessions/mayor/s1.jsonl";
  messages: unknown[] = [];
  accessTokens: string[] = [];
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

  async prompt(): Promise<void> {
    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "On it! " },
    });
    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "🐱" },
    });
    // Mayor's own tool execution should not surface as chat activity.
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
    conversationDir: "/tmp/conversation",
    mayorSessionsDir: "/tmp/conversation/sessions/mayor",
    customTools: [],
  };
}

describe("MayorRuntimeService", () => {
  it("streams assistant text as profile-routed events and returns the accumulated reply", async () => {
    const session = new FakeMayorSession();
    const sessionFiles: Array<string | undefined> = [];
    const service = new MayorRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token-1",
      createSession: async (_input: CreateMayorSessionInput) => session,
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
    expect(sessionFiles).toEqual(["/tmp/conversation/sessions/mayor/s1.jsonl"]);

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

  it("reuses one session per profile across turns", async () => {
    const sessions: FakeMayorSession[] = [];
    const service = new MayorRuntimeService({
      agentDir: "/tmp/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async () => {
        const session = new FakeMayorSession();
        sessions.push(session);
        return session;
      },
    });

    await service.prompt(baseInput(), "first", () => {});
    await service.prompt(baseInput(), "second", () => {});

    expect(sessions).toHaveLength(1);
  });
});
