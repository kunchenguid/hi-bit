import type { TranscriptEvent } from "@shared/transcript";
import { describe, expect, it } from "vitest";
import { buildParentChatHistory } from "./parentChatHistory";

function mkEvent(partial: Partial<TranscriptEvent> & { timestamp: string }): TranscriptEvent {
  return {
    role: "parent",
    sessionId: "sess-1",
    kind: "user_message",
    text: "",
    ...partial,
  };
}

describe("buildParentChatHistory", () => {
  it("returns an empty array when given no events", () => {
    expect(buildParentChatHistory([])).toEqual([]);
  });

  it("maps parent user_message to a parent text bubble", () => {
    const events = [mkEvent({ timestamp: "t1", kind: "user_message", text: "focus on loops" })];
    const result = buildParentChatHistory(events);
    expect(result).toEqual([
      {
        id: "t1-u",
        role: "parent",
        kind: "text",
        text: "focus on loops",
        timestamp: "t1",
      },
    ]);
  });

  it("maps parent assistant_message to a bit text bubble", () => {
    const events = [
      mkEvent({ timestamp: "t2", kind: "assistant_message", text: "got it, will do" }),
    ];
    const result = buildParentChatHistory(events);
    expect(result).toEqual([
      {
        id: "t2-a",
        role: "bit",
        kind: "text",
        text: "got it, will do",
        timestamp: "t2",
      },
    ]);
  });

  it("maps parent error to a bit error bubble", () => {
    const events = [mkEvent({ timestamp: "t3", kind: "error", text: "harness crashed" })];
    const result = buildParentChatHistory(events);
    expect(result).toEqual([
      {
        id: "t3-e",
        role: "bit",
        kind: "error",
        text: "harness crashed",
        timestamp: "t3",
      },
    ]);
  });

  it("skips tool_call and tool_result events", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t1", kind: "user_message", text: "hi" }),
      mkEvent({ timestamp: "t2", kind: "tool_call", text: "Edit state.md" }),
      mkEvent({ timestamp: "t3", kind: "tool_result", text: "ok" }),
      mkEvent({ timestamp: "t4", kind: "assistant_message", text: "done" }),
    ];
    const result = buildParentChatHistory(events);
    expect(result.map((m) => m.text)).toEqual(["hi", "done"]);
  });

  it("skips events whose role is not parent", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t1", role: "kid", kind: "user_message", text: "kid says hi" }),
      mkEvent({ timestamp: "t2", kind: "user_message", text: "parent says hi" }),
    ];
    const result = buildParentChatHistory(events);
    expect(result.map((m) => m.text)).toEqual(["parent says hi"]);
  });

  it("preserves input order across a mixed transcript", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t1", kind: "user_message", text: "first" }),
      mkEvent({ timestamp: "t2", kind: "assistant_message", text: "reply 1" }),
      mkEvent({ timestamp: "t3", kind: "user_message", text: "second" }),
      mkEvent({ timestamp: "t4", kind: "assistant_message", text: "reply 2" }),
    ];
    const result = buildParentChatHistory(events);
    expect(result.map((m) => `${m.role}:${m.text}`)).toEqual([
      "parent:first",
      "bit:reply 1",
      "parent:second",
      "bit:reply 2",
    ]);
  });
});
