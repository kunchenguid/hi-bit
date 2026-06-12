import {
  type BeforeProviderRequestEvent,
  createExtensionRuntime,
  createSyntheticSourceInfo,
  type Extension,
  type ExtensionContext,
  type LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent";

export const CODEX_FAST_MODE_SERVICE_TIER = "priority";
export const CODEX_FAST_MODE_SUPPORTED_MODEL_IDS = ["gpt-5.4", "gpt-5.5"] as const;

const CODEX_FAST_MODE_EXTENSION_PATH = "<inline:hi-bit-codex-fast-mode>";

type ModelIdentity = {
  provider?: string;
  id?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCodexFastModeSupportedModel(model: ModelIdentity | null | undefined): boolean {
  return (
    model?.provider === "openai-codex" &&
    CODEX_FAST_MODE_SUPPORTED_MODEL_IDS.includes(
      model.id as (typeof CODEX_FAST_MODE_SUPPORTED_MODEL_IDS)[number],
    )
  );
}

export function applyCodexFastModeServiceTier(
  payload: unknown,
  model: ModelIdentity | null | undefined,
): unknown | undefined {
  if (!isCodexFastModeSupportedModel(model)) return undefined;
  if (!isRecord(payload)) return undefined;
  return { ...payload, service_tier: CODEX_FAST_MODE_SERVICE_TIER };
}

/**
 * Inline Pi extension that requests OpenAI Codex fast mode for supported models.
 * This stays non-configurable and silently skips unsupported/custom models so
 * user-selected providers keep working unchanged.
 */
function createCodexFastModeExtension(): Extension {
  const sourceInfo = createSyntheticSourceInfo(CODEX_FAST_MODE_EXTENSION_PATH, {
    source: "hi-bit",
    scope: "temporary",
    origin: "top-level",
  });

  const handler = (event: BeforeProviderRequestEvent, ctx: ExtensionContext) =>
    applyCodexFastModeServiceTier(event.payload, ctx.model);

  return {
    path: CODEX_FAST_MODE_EXTENSION_PATH,
    resolvedPath: CODEX_FAST_MODE_EXTENSION_PATH,
    sourceInfo,
    handlers: new Map([["before_provider_request", [handler]]]) as Extension["handlers"],
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}

export function createCodexFastModeExtensionsResult(): LoadExtensionsResult {
  return {
    extensions: [createCodexFastModeExtension()],
    errors: [],
    runtime: createExtensionRuntime(),
  };
}
