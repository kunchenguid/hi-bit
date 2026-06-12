import type { BeforeProviderRequestEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  applyCodexFastModeServiceTier,
  CODEX_FAST_MODE_SERVICE_TIER,
  createCodexFastModeExtensionsResult,
  isCodexFastModeSupportedModel,
} from "./codexFastMode";

const supportedModel = { provider: "openai-codex", id: "gpt-5.5" };

describe("isCodexFastModeSupportedModel", () => {
  it("supports the OpenAI Codex models with priority tier access", () => {
    expect(isCodexFastModeSupportedModel({ provider: "openai-codex", id: "gpt-5.4" })).toBe(true);
    expect(isCodexFastModeSupportedModel({ provider: "openai-codex", id: "gpt-5.5" })).toBe(true);
  });

  it("skips unsupported or custom models silently", () => {
    expect(isCodexFastModeSupportedModel({ provider: "openai-codex", id: "gpt-5.3" })).toBe(false);
    expect(isCodexFastModeSupportedModel({ provider: "anthropic", id: "gpt-5.5" })).toBe(false);
    expect(isCodexFastModeSupportedModel({ provider: "custom", id: "my-model" })).toBe(false);
    expect(isCodexFastModeSupportedModel(undefined)).toBe(false);
  });
});

describe("applyCodexFastModeServiceTier", () => {
  it("adds the priority service tier for supported Codex requests", () => {
    expect(applyCodexFastModeServiceTier({ model: "gpt-5.5" }, supportedModel)).toEqual({
      model: "gpt-5.5",
      service_tier: CODEX_FAST_MODE_SERVICE_TIER,
    });
  });

  it("does not change text verbosity when enabling the service tier", () => {
    const result = applyCodexFastModeServiceTier(
      { model: "gpt-5.5", text: { format: { type: "text" } } },
      supportedModel,
    );

    expect(result).toEqual({
      model: "gpt-5.5",
      text: { format: { type: "text" } },
      service_tier: "priority",
    });
    expect(JSON.stringify(result)).not.toContain("verbosity");
  });

  it("leaves unsupported models and non-object payloads untouched", () => {
    expect(
      applyCodexFastModeServiceTier(
        { model: "custom-model" },
        { provider: "openai-codex", id: "custom-model" },
      ),
    ).toBeUndefined();
    expect(applyCodexFastModeServiceTier("payload", supportedModel)).toBeUndefined();
  });
});

describe("createCodexFastModeExtensionsResult", () => {
  it("registers a before_provider_request hook that injects the outgoing request field", async () => {
    const extension = createCodexFastModeExtensionsResult().extensions[0];
    const [handler] = extension.handlers.get("before_provider_request") ?? [];

    const result = await handler?.(
      {
        type: "before_provider_request",
        payload: { model: "gpt-5.5" },
      } satisfies BeforeProviderRequestEvent,
      { model: supportedModel } as ExtensionContext,
    );

    expect(result).toEqual({ model: "gpt-5.5", service_tier: "priority" });
  });
});
