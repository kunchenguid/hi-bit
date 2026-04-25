import { describe, expect, it } from "vitest";
import { buildClaudeStreamArgs } from "./claudeStreamArgs";

describe("buildClaudeStreamArgs", () => {
  it("uses --session-id on start mode and includes both stream-json directions", () => {
    const args = buildClaudeStreamArgs({ sessionId: "abc", mode: "start" });
    expect(args).toEqual([
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--effort",
      "low",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--input-format",
      "stream-json",
      "-p",
      "",
      "--session-id",
      "abc",
    ]);
  });

  it("uses --resume on resume mode", () => {
    const args = buildClaudeStreamArgs({ sessionId: "abc", mode: "resume" });
    expect(args).toContain("--resume");
    expect(args).not.toContain("--session-id");
    const i = args.indexOf("--resume");
    expect(args[i + 1]).toBe("abc");
  });
});
