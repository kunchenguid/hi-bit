import { describe, expect, it } from "vitest";
import { parseClaudeStreamJson } from "./claudeStreamJson";

const successResult = {
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Hi there friend",
  duration_ms: 2063,
  duration_api_ms: 3255,
  num_turns: 1,
  total_cost_usd: 0.05,
  usage: {
    input_tokens: 6,
    output_tokens: 10,
    cache_creation_input_tokens: 7019,
    cache_read_input_tokens: 16202,
  },
};

function jsonl(...events: unknown[]): string {
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

describe("parseClaudeStreamJson", () => {
  it("extracts the final result text and usage from a success result event", () => {
    const stdout = jsonl(
      { type: "system", subtype: "init", session_id: "abc" },
      { type: "stream_event", event: { type: "message_start" } },
      successResult,
    );

    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("Hi there friend");
    expect(parsed.isError).toBe(false);
    expect(parsed.errorMessage).toBeNull();
    expect(parsed.usage).toEqual({
      inputTokens: 6,
      outputTokens: 10,
      cacheCreationInputTokens: 7019,
      cacheReadInputTokens: 16202,
    });
    expect(parsed.numTurns).toBe(1);
    expect(parsed.durationApiMs).toBe(3255);
  });

  it("returns the last result event when more than one is present", () => {
    const stdout = jsonl(
      { ...successResult, result: "first" },
      { ...successResult, result: "last", usage: { ...successResult.usage, output_tokens: 99 } },
    );
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("last");
    expect(parsed.usage?.outputTokens).toBe(99);
  });

  it("skips malformed JSON lines without throwing", () => {
    const stdout = `not json\n${JSON.stringify(successResult)}\n{"truncated":\n`;
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("Hi there friend");
    expect(parsed.usage?.cacheReadInputTokens).toBe(16202);
  });

  it("ignores empty lines and trailing whitespace", () => {
    const stdout = `\n\n${JSON.stringify(successResult)}\n   \n`;
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("Hi there friend");
  });

  it("marks the parse as an error when subtype is not success", () => {
    const stdout = jsonl({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      result: "rate limit hit",
      usage: successResult.usage,
    });
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.isError).toBe(true);
    expect(parsed.errorMessage).toBe("rate limit hit");
    expect(parsed.text).toBe("rate limit hit");
    expect(parsed.usage).not.toBeNull();
  });

  it("returns isError when no result event is present", () => {
    const stdout = jsonl({ type: "system", subtype: "init", session_id: "abc" });
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.isError).toBe(true);
    expect(parsed.errorMessage).toMatch(/no result event/i);
    expect(parsed.text).toBe("");
    expect(parsed.usage).toBeNull();
  });

  it("returns isError on completely empty stdout", () => {
    const parsed = parseClaudeStreamJson("");
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toBe("");
    expect(parsed.usage).toBeNull();
  });

  it("treats missing usage fields as zero", () => {
    const stdout = jsonl({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "ok",
      usage: { input_tokens: 5, output_tokens: 3 },
    });
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.usage).toEqual({
      inputTokens: 5,
      outputTokens: 3,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });

  it("returns null usage when result event has no usage block at all", () => {
    const stdout = jsonl({ type: "result", subtype: "success", is_error: false, result: "ok" });
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("ok");
    expect(parsed.usage).toBeNull();
  });

  it("falls back to assistant message text when result.result is empty on success", () => {
    const stdout = jsonl(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Nice save. " },
            { type: "tool_use", name: "Read", input: { file_path: "index.html" } },
          ],
        },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Add a green square next." }] },
      },
      { ...successResult, result: "" },
    );
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("Nice save. Add a green square next.");
    expect(parsed.isError).toBe(false);
    expect(parsed.errorMessage).toBeNull();
  });

  it("falls back to streamed text deltas when result.result is empty on success", () => {
    const stdout = jsonl(
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Nice save. " } },
      },
      {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Add a green square next." },
        },
      },
      { ...successResult, result: "" },
    );
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("Nice save. Add a green square next.");
    expect(parsed.isError).toBe(false);
    expect(parsed.errorMessage).toBeNull();
  });

  it("uses fallback text associated with the last result event only", () => {
    const stdout = jsonl(
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "first reply" }] },
      },
      { ...successResult, result: "" },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "second reply" }] },
      },
      { ...successResult, result: "", usage: { ...successResult.usage, output_tokens: 22 } },
    );

    const parsed = parseClaudeStreamJson(stdout);

    expect(parsed.text).toBe("second reply");
    expect(parsed.usage?.outputTokens).toBe(22);
  });

  it("does not duplicate fallback text when assistant and stream events both carry it", () => {
    const stdout = jsonl(
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Same reply" } },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Same reply" }] },
      },
      { ...successResult, result: "" },
    );

    const parsed = parseClaudeStreamJson(stdout);

    expect(parsed.text).toBe("Same reply");
  });

  it("prefers result.result over assistant message text when both are present", () => {
    const stdout = jsonl(
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "intermediate thinking" }] },
      },
      { ...successResult, result: "final answer" },
    );
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("final answer");
  });

  it("still flags an error when result.result is empty and no assistant text was emitted", () => {
    const stdout = jsonl(
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read", input: {} }] },
      },
      { ...successResult, result: "" },
    );
    const parsed = parseClaudeStreamJson(stdout);
    expect(parsed.text).toBe("");
  });
});
