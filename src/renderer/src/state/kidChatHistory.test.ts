import type { TranscriptEvent } from "@shared/transcript";
import { describe, expect, it } from "vitest";
import { KID_EMPTY_REPLY, KID_FRIENDLY_ERROR } from "./chatStore";
import { buildKidChatHistory } from "./kidChatHistory";

function mkEvent(partial: Partial<TranscriptEvent> & { timestamp: string }): TranscriptEvent {
  return {
    role: "kid",
    sessionId: "sess-1",
    kind: "user_message",
    text: "",
    ...partial,
  };
}

describe("buildKidChatHistory", () => {
  it("returns an empty array when given no events", () => {
    expect(buildKidChatHistory([])).toEqual([]);
  });

  it("maps kid user_message to a kid text bubble", () => {
    const events = [mkEvent({ timestamp: "t1", kind: "user_message", text: "hi bit" })];
    const result = buildKidChatHistory(events);
    expect(result).toEqual([
      {
        id: "t1-u",
        role: "kid",
        kind: "text",
        text: "hi bit",
        timestamp: "t1",
      },
    ]);
  });

  it("hides persisted UI context from kid text bubbles", () => {
    const events = [
      mkEvent({
        timestamp: "t1",
        kind: "user_message",
        text: [
          "<hi-bit:ui-context>",
          "The editor is already open next to chat.",
          "</hi-bit:ui-context>",
          "",
          "yes",
        ].join("\n"),
      }),
    ];

    const result = buildKidChatHistory(events);

    expect(result).toEqual([
      {
        id: "t1-u",
        role: "kid",
        kind: "text",
        text: "yes",
        timestamp: "t1",
      },
    ]);
  });

  it("restores automatic save prompts as divider messages when rebuilding kid chat history", () => {
    const events: TranscriptEvent[] = [
      mkEvent({
        timestamp: "t1",
        kind: "user_message",
        text: [
          "The kid just clicked Save in Hi Bit.",
          "File saved: index.html",
          "Project: about-me",
          "Use the diff below instead of reading the file first.",
          "",
          "```diff",
          "+<p>space</p>",
          "```",
        ].join("\n"),
      }),
      mkEvent({ timestamp: "t2", kind: "assistant_message", text: "Nice save. Add a color next." }),
    ];

    const result = buildKidChatHistory(events);

    expect(result.map((m) => `${m.role}:${m.kind}:${m.text}`)).toEqual([
      "system:divider:Saved index.html",
      "bit:text:Nice save. Add a color next.",
    ]);
  });

  it("maps kid assistant_message to a bit text bubble", () => {
    const events = [
      mkEvent({ timestamp: "t2", kind: "assistant_message", text: "hey Ada, ready?" }),
    ];
    const result = buildKidChatHistory(events);
    expect(result).toEqual([
      {
        id: "t2-a",
        role: "bit",
        kind: "text",
        text: "hey Ada, ready?",
        timestamp: "t2",
      },
    ]);
  });

  it("trims trailing whitespace from hydrated bit text bubbles", () => {
    const events = [
      mkEvent({ timestamp: "t2", kind: "assistant_message", text: "hey Ada, ready?\n\n  " }),
    ];
    const result = buildKidChatHistory(events);

    expect(result[0]).toMatchObject({
      role: "bit",
      kind: "text",
      text: "hey Ada, ready?",
    });
  });

  it("maps kid error events to a kid-friendly error bubble", () => {
    const events = [mkEvent({ timestamp: "t3", kind: "error", text: "harness crashed" })];
    const result = buildKidChatHistory(events);
    expect(result).toEqual([
      {
        id: "t3-e",
        role: "bit",
        kind: "error",
        text: KID_FRIENDLY_ERROR,
        timestamp: "t3",
      },
    ]);
  });

  it("converts a blank assistant_message into a kid-friendly empty-reply bubble", () => {
    const events = [mkEvent({ timestamp: "t9", kind: "assistant_message", text: "\n" })];
    const result = buildKidChatHistory(events);
    expect(result).toEqual([
      {
        id: "t9-a",
        role: "bit",
        kind: "error",
        text: KID_EMPTY_REPLY,
        timestamp: "t9",
      },
    ]);
  });

  it("treats whitespace-only assistant_message as empty too", () => {
    const events = [mkEvent({ timestamp: "t10", kind: "assistant_message", text: "   \t " })];
    const result = buildKidChatHistory(events);
    expect(result[0]).toMatchObject({ role: "bit", kind: "error", text: KID_EMPTY_REPLY });
  });

  it("skips tool_call and tool_result events", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t1", kind: "user_message", text: "hi" }),
      mkEvent({ timestamp: "t2", kind: "tool_call", text: "Edit index.html" }),
      mkEvent({ timestamp: "t3", kind: "tool_result", text: "ok" }),
      mkEvent({ timestamp: "t4", kind: "assistant_message", text: "done" }),
    ];
    const result = buildKidChatHistory(events);
    expect(result.map((m) => m.text)).toEqual(["hi", "done"]);
  });

  it("skips events whose role is not kid", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t1", role: "parent", kind: "user_message", text: "parent directive" }),
      mkEvent({ timestamp: "t2", kind: "user_message", text: "kid hi" }),
    ];
    const result = buildKidChatHistory(events);
    expect(result.map((m) => m.text)).toEqual(["kid hi"]);
  });

  it("maps a kid system_event to a system divider message", () => {
    const events: TranscriptEvent[] = [
      mkEvent({
        timestamp: "t8",
        kind: "system_event",
        text: "New project: a page that rolls a dice",
        metadata: { type: "dream_switch", dreamId: "dice-roller" },
      }),
    ];
    const result = buildKidChatHistory(events);
    expect(result).toEqual([
      {
        id: "t8-s",
        role: "system",
        kind: "divider",
        text: "New project: a page that rolls a dice",
        timestamp: "t8",
      },
    ]);
  });

  it("skips a system_event whose text is blank", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t8", kind: "system_event", text: "   " }),
    ];
    expect(buildKidChatHistory(events)).toEqual([]);
  });

  it("preserves input order across a mixed transcript", () => {
    const events: TranscriptEvent[] = [
      mkEvent({ timestamp: "t1", kind: "user_message", text: "first" }),
      mkEvent({ timestamp: "t2", kind: "assistant_message", text: "reply 1" }),
      mkEvent({ timestamp: "t3", kind: "user_message", text: "second" }),
      mkEvent({ timestamp: "t4", kind: "assistant_message", text: "reply 2" }),
    ];
    const result = buildKidChatHistory(events);
    expect(result.map((m) => `${m.role}:${m.text}`)).toEqual([
      "kid:first",
      "bit:reply 1",
      "kid:second",
      "bit:reply 2",
    ]);
  });
});
