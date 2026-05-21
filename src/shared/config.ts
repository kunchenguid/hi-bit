export type HiBitConfig = {
  version: 1;
  defaultModel: string;
};

export const DEFAULT_CODEX_MODEL = "openai-codex/gpt-5.5";

export function defaultHiBitConfig(): HiBitConfig {
  return {
    version: 1,
    defaultModel: DEFAULT_CODEX_MODEL,
  };
}

export function normalizeHiBitConfig(value: unknown): HiBitConfig {
  if (!value || typeof value !== "object") return defaultHiBitConfig();
  const candidate = value as { defaultModel?: unknown };
  if (typeof candidate.defaultModel !== "string" || !candidate.defaultModel.trim()) {
    return defaultHiBitConfig();
  }
  return {
    version: 1,
    defaultModel: candidate.defaultModel.trim(),
  };
}
