import { describe, expect, it } from "vitest";
import {
  chatEventsFromPiEvent,
  chatMessagesFromPiMessages,
  toolContentFromResult,
} from "./piMessages";

describe("chatMessagesFromPiMessages", () => {
  it("converts Pi user and assistant messages into renderer chat messages", () => {
    const messages = chatMessagesFromPiMessages([
      { role: "user", content: "Make a game", timestamp: 1 },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I made a start." },
          { type: "thinking", thinking: "hidden" },
        ],
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "1",
        toolName: "read",
        content: [],
        isError: false,
        timestamp: 3,
      },
    ]);

    expect(messages).toEqual([
      { id: "user-1-0", role: "user", text: "Make a game", createdAt: new Date(1).toISOString() },
      {
        id: "assistant-2-1",
        role: "assistant",
        text: "I made a start.",
        createdAt: new Date(2).toISOString(),
      },
    ]);
  });
});

describe("chatEventsFromPiEvent", () => {
  it("maps assistant text deltas", () => {
    expect(
      chatEventsFromPiEvent(
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Hi" },
        },
        "project-1",
        "turn-1",
      ),
    ).toEqual([{ type: "assistant_delta", projectId: "project-1", turnId: "turn-1", text: "Hi" }]);
  });

  it("maps tool lifecycle events", () => {
    expect(
      chatEventsFromPiEvent(
        {
          type: "tool_execution_start",
          toolCallId: "call-1",
          toolName: "write",
          args: { path: "index.html" },
        },
        "project-1",
        "turn-1",
      ),
    ).toEqual([
      {
        type: "tool_start",
        projectId: "project-1",
        turnId: "turn-1",
        callId: "call-1",
        toolName: "write",
        args: { path: "index.html" },
      },
    ]);

    expect(
      chatEventsFromPiEvent(
        {
          type: "tool_execution_end",
          toolCallId: "call-1",
          toolName: "write",
          result: { content: [{ type: "text", text: "done" }] },
          isError: false,
        },
        "project-1",
        "turn-1",
      ),
    ).toEqual([
      {
        type: "tool_end",
        projectId: "project-1",
        turnId: "turn-1",
        callId: "call-1",
        isError: false,
        content: [{ type: "text", text: "done" }],
      },
    ]);
  });

  it("maps retry and compaction events into kid-visible tool rows", () => {
    expect(
      chatEventsFromPiEvent(
        { type: "compaction_start", reason: "threshold" },
        "project-1",
        "turn-1",
      ),
    ).toEqual([
      {
        type: "tool_start",
        projectId: "project-1",
        turnId: "turn-1",
        callId: "turn-1:compaction",
        toolName: "compact_context",
        args: { reason: "threshold" },
      },
    ]);

    expect(
      chatEventsFromPiEvent(
        {
          type: "auto_retry_start",
          attempt: 1,
          maxAttempts: 3,
          delayMs: 100,
          errorMessage: "busy",
        },
        "project-1",
        "turn-1",
      ),
    ).toEqual([
      {
        type: "tool_start",
        projectId: "project-1",
        turnId: "turn-1",
        callId: "turn-1:retry:1",
        toolName: "retry",
        args: { attempt: 1, maxAttempts: 3, delayMs: 100, errorMessage: "busy" },
      },
    ]);
  });
});

describe("toolContentFromResult", () => {
  it("normalizes text and image tool content", () => {
    expect(
      toolContentFromResult({
        content: [
          { type: "text", text: "hello" },
          { type: "image", data: "base64", mimeType: "image/png" },
          { type: "thinking", thinking: "skip" },
        ],
      }),
    ).toEqual([
      { type: "text", text: "hello" },
      { type: "image", data: "base64", mimeType: "image/png" },
    ]);
  });
});
