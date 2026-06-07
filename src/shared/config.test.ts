import { describe, expect, it } from "vitest";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_THINKING_SPEED,
  defaultHiBitConfig,
  normalizeHiBitConfig,
} from "./config";

describe("normalizeHiBitConfig", () => {
  it("keeps valid rebuilt config values", () => {
    expect(
      normalizeHiBitConfig({
        version: 1,
        defaultModel: "openai-codex/gpt-5.5-fast",
        thinkingSpeed: "high",
      }),
    ).toEqual({
      version: 1,
      defaultModel: "openai-codex/gpt-5.5-fast",
      thinkingSpeed: "high",
    });
  });

  it("defaults a missing or invalid thinking speed to balanced while keeping the model", () => {
    expect(normalizeHiBitConfig({ version: 1, defaultModel: "openai-codex/gpt-5.5" })).toEqual({
      version: 1,
      defaultModel: "openai-codex/gpt-5.5",
      thinkingSpeed: DEFAULT_THINKING_SPEED,
    });
    expect(
      normalizeHiBitConfig({
        version: 1,
        defaultModel: "openai-codex/gpt-5.5",
        thinkingSpeed: "turbo",
      }).thinkingSpeed,
    ).toBe(DEFAULT_THINKING_SPEED);
  });

  it("migrates old or malformed config files to the Codex default", () => {
    expect(normalizeHiBitConfig({ version: 2, defaultAgent: "claude" })).toEqual(
      defaultHiBitConfig(),
    );
    expect(normalizeHiBitConfig(null)).toEqual({
      version: 1,
      defaultModel: DEFAULT_CODEX_MODEL,
      thinkingSpeed: DEFAULT_THINKING_SPEED,
    });
  });
});
