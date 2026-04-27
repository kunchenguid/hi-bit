import { describe, expect, it } from "vitest";
import {
  BIT_ALLOWED_TOOLS,
  BIT_DENIED_TOOLS,
  renderClaudeSettings,
  renderOpencodeConfig,
} from "./profileHarnessConfig";

describe("BIT tool spec", () => {
  it("allows the minimal set Bit needs to read state and update progress", () => {
    expect(BIT_ALLOWED_TOOLS).toEqual(["Read", "Write", "Edit", "Glob"]);
  });

  it("denies tools that don't belong in a kid session", () => {
    expect(BIT_DENIED_TOOLS).toEqual([
      "Bash",
      "BashOutput",
      "KillBash",
      "WebFetch",
      "WebSearch",
      "Task",
      "TodoWrite",
      "NotebookEdit",
    ]);
  });

  it("never lists the same tool in both allow and deny", () => {
    const allow = new Set<string>(BIT_ALLOWED_TOOLS);
    for (const t of BIT_DENIED_TOOLS) {
      expect(allow.has(t)).toBe(false);
    }
  });
});

describe("renderClaudeSettings", () => {
  it("emits a settings.json with permissions.allow + permissions.deny", () => {
    const parsed = JSON.parse(renderClaudeSettings());
    expect(parsed).toEqual({
      permissions: {
        allow: ["Read", "Write", "Edit", "Glob"],
        deny: [
          "Bash",
          "BashOutput",
          "KillBash",
          "WebFetch",
          "WebSearch",
          "Task",
          "TodoWrite",
          "NotebookEdit",
        ],
      },
    });
  });

  it("ends with a trailing newline so editors don't reformat it", () => {
    expect(renderClaudeSettings().endsWith("\n")).toBe(true);
  });
});

describe("renderOpencodeConfig", () => {
  it("emits an opencode.json that denies unspecified tools and only allows Bit's tools", () => {
    const parsed = JSON.parse(renderOpencodeConfig()) as {
      $schema?: string;
      permission?: Record<string, string>;
    };
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.permission).toEqual({
      "*": "deny",
      read: "allow",
      edit: "allow",
      glob: "allow",
    });
    expect(parsed.permission?.task).toBeUndefined();
    expect(parsed.permission?.websearch).toBeUndefined();
    expect(parsed.permission?.grep).toBeUndefined();
    expect(parsed.permission?.lsp).toBeUndefined();
    expect(parsed.permission?.skill).toBeUndefined();
  });

  it("ends with a trailing newline", () => {
    expect(renderOpencodeConfig().endsWith("\n")).toBe(true);
  });
});
