import { describe, expect, it } from "vitest";
import { buildHarnessCommand } from "./command";

const base = {
  binary: "/usr/local/bin/fake",
  sessionId: "sess-123",
  prompt: "hello bit",
  cwd: "/tmp/profile",
};

describe("buildHarnessCommand", () => {
  describe("claude", () => {
    it("builds a start command with isolation flags, --effort low, stream-json output, and --session-id", () => {
      const cmd = buildHarnessCommand({ ...base, harness: "claude", mode: "start" });
      expect(cmd.bin).toBe("/usr/local/bin/fake");
      expect(cmd.args).toEqual([
        "--setting-sources",
        "project",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--effort",
        "low",
        "--output-format",
        "stream-json",
        "--verbose",
        "-p",
        "hello bit",
        "--session-id",
        "sess-123",
      ]);
      expect(cmd.cwd).toBe("/tmp/profile");
    });

    it("builds a resume command with isolation flags, --effort low, stream-json output, and --resume", () => {
      const cmd = buildHarnessCommand({ ...base, harness: "claude", mode: "resume" });
      expect(cmd.args).toEqual([
        "--setting-sources",
        "project",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--effort",
        "low",
        "--output-format",
        "stream-json",
        "--verbose",
        "--resume",
        "sess-123",
        "-p",
        "hello bit",
      ]);
    });
  });

  describe("codex", () => {
    it("builds a start command with isolation flags, sandbox, and reasoning effort 'low'", () => {
      const cmd = buildHarnessCommand({ ...base, harness: "codex", mode: "start" });
      expect(cmd.args).toEqual([
        "exec",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--full-auto",
        "-c",
        'model_reasoning_effort="low"',
        "--session-id",
        "sess-123",
        "hello bit",
      ]);
    });

    it("builds a resume command using only flags supported by 'codex exec resume'", () => {
      const cmd = buildHarnessCommand({ ...base, harness: "codex", mode: "resume" });
      expect(cmd.args).toEqual([
        "exec",
        "resume",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "-c",
        'model_reasoning_effort="low"',
        "sess-123",
        "hello bit",
      ]);
    });
  });

  describe("opencode", () => {
    it("builds a start command with --pure and run --session", () => {
      const cmd = buildHarnessCommand({ ...base, harness: "opencode", mode: "start" });
      expect(cmd.args).toEqual(["run", "--pure", "--session", "sess-123", "hello bit"]);
    });

    it("builds a resume command identical to start (stateful SQLite backing)", () => {
      const start = buildHarnessCommand({ ...base, harness: "opencode", mode: "start" });
      const resume = buildHarnessCommand({ ...base, harness: "opencode", mode: "resume" });
      expect(resume.args).toEqual(start.args);
    });
  });

  it("preserves whitespace and quotes inside the prompt as a single arg", () => {
    const cmd = buildHarnessCommand({
      ...base,
      harness: "claude",
      mode: "start",
      prompt: 'say "hi there", please',
    });
    const idx = cmd.args.indexOf("-p");
    expect(cmd.args[idx + 1]).toBe('say "hi there", please');
  });

  it("rejects an empty sessionId", () => {
    expect(() =>
      buildHarnessCommand({ ...base, harness: "claude", mode: "start", sessionId: "" }),
    ).toThrow(/sessionId/);
  });

  it("rejects an empty prompt", () => {
    expect(() =>
      buildHarnessCommand({ ...base, harness: "claude", mode: "start", prompt: "   " }),
    ).toThrow(/prompt/);
  });

  it("rejects an empty binary", () => {
    expect(() =>
      buildHarnessCommand({ ...base, harness: "claude", mode: "start", binary: "" }),
    ).toThrow(/binary/);
  });

  it("rejects an empty cwd", () => {
    expect(() =>
      buildHarnessCommand({ ...base, harness: "claude", mode: "start", cwd: "" }),
    ).toThrow(/cwd/);
  });
});
