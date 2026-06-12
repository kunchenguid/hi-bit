import { writeFileSync } from "node:fs";
import type { BeforeProviderRequestEvent, ExtensionContext, ResourceLoader } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { applyCodexFastModeServiceTier } from "../../../../src/main/pi/codexFastMode";
import { createBitResourceLoader, createBotResourceLoader } from "../../../../src/main/pi/piResources";

async function applyHook(loader: ResourceLoader, model: { provider: string; id: string }) {
  const extension = loader.getExtensions().extensions[0];
  const [handler] = extension.handlers.get("before_provider_request") ?? [];
  if (!handler) throw new Error("missing before_provider_request handler");

  return handler(
    {
      type: "before_provider_request",
      payload: { model: model.id, text: { format: { type: "text" } } },
    } satisfies BeforeProviderRequestEvent,
    { model } as ExtensionContext,
  );
}

test("records reviewer-visible Codex fast mode request payload evidence", async () => {
  const supported55 = { provider: "openai-codex", id: "gpt-5.5" };
  const supported54 = { provider: "openai-codex", id: "gpt-5.4" };
  const custom = { provider: "openai-codex", id: "custom-model" };

  const evidence = {
    scenario: "Codex fast mode provider request payload transform",
    checks: {
      directSupportedGpt55: applyCodexFastModeServiceTier(
        { model: "gpt-5.5", text: { format: { type: "text" } } },
        supported55,
      ),
      directSupportedGpt54: applyCodexFastModeServiceTier({ model: "gpt-5.4" }, supported54),
      directUnsupportedCustom:
        applyCodexFastModeServiceTier({ model: "custom-model" }, custom) ?? null,
      bitResourceLoaderHook: await applyHook(createBitResourceLoader().loader, supported55),
      botResourceLoaderHook: await applyHook(createBotResourceLoader(), supported55),
    },
    interpretation:
      "Bit and bot resource loaders register before_provider_request hooks that add service_tier=priority for supported openai-codex gpt-5.4/gpt-5.5 models while leaving unsupported/custom models unchanged and preserving text settings.",
  };

  writeFileSync(
    ".no-mistakes/evidence/fm/codex-fast-mode-p4/codex-fast-mode-provider-request.json",
    `${JSON.stringify(evidence, null, 2)}\n`,
  );

  expect(evidence.checks.bitResourceLoaderHook).toMatchObject({ service_tier: "priority" });
  expect(evidence.checks.botResourceLoaderHook).toMatchObject({ service_tier: "priority" });
  expect(evidence.checks.directUnsupportedCustom).toBeNull();
  expect(JSON.stringify(evidence.checks)).not.toContain("verbosity");
});
