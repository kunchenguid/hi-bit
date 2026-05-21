import { describe, expect, it } from "vitest";
import { DEFAULT_CODEX_MODEL, defaultHiBitConfig, normalizeHiBitConfig } from "./config";

describe("normalizeHiBitConfig", () => {
  it("keeps valid rebuilt config values", () => {
    expect(normalizeHiBitConfig({ version: 1, defaultModel: "openai-codex/gpt-5.5-fast" })).toEqual(
      {
        version: 1,
        defaultModel: "openai-codex/gpt-5.5-fast",
      },
    );
  });

  it("migrates old or malformed config files to the Codex default", () => {
    expect(normalizeHiBitConfig({ version: 2, defaultAgent: "claude" })).toEqual(
      defaultHiBitConfig(),
    );
    expect(normalizeHiBitConfig(null)).toEqual({ version: 1, defaultModel: DEFAULT_CODEX_MODEL });
  });
});
