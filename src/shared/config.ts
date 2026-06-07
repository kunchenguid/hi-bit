/**
 * How hard Bit and the bots think before answering or building. Stored app-wide
 * and passed straight through to the Pi runtime as its `thinkingLevel` (these are
 * a subset of the runtime's levels), so a grown-up trades reply speed for build
 * quality from one slider. Ordered fastest -> smartest.
 */
export type ThinkingSpeed = "minimal" | "low" | "medium" | "high" | "xhigh";

/** The slider stops, fastest first, with their kid/parent-friendly labels. */
export const THINKING_SPEED_STOPS: ReadonlyArray<{ value: ThinkingSpeed; label: string }> = [
  { value: "minimal", label: "Fastest" },
  { value: "low", label: "Faster" },
  { value: "medium", label: "Balanced" },
  { value: "high", label: "Smarter" },
  { value: "xhigh", label: "Smartest" },
];

/** Balanced keeps the long-standing default behavior. */
export const DEFAULT_THINKING_SPEED: ThinkingSpeed = "medium";

function isThinkingSpeed(value: unknown): value is ThinkingSpeed {
  return THINKING_SPEED_STOPS.some((stop) => stop.value === value);
}

export type HiBitConfig = {
  version: 1;
  defaultModel: string;
  thinkingSpeed: ThinkingSpeed;
};

export const DEFAULT_CODEX_MODEL = "openai-codex/gpt-5.5";

export function defaultHiBitConfig(): HiBitConfig {
  return {
    version: 1,
    defaultModel: DEFAULT_CODEX_MODEL,
    thinkingSpeed: DEFAULT_THINKING_SPEED,
  };
}

export function normalizeHiBitConfig(value: unknown): HiBitConfig {
  if (!value || typeof value !== "object") return defaultHiBitConfig();
  const candidate = value as { defaultModel?: unknown; thinkingSpeed?: unknown };
  if (typeof candidate.defaultModel !== "string" || !candidate.defaultModel.trim()) {
    return defaultHiBitConfig();
  }
  return {
    version: 1,
    defaultModel: candidate.defaultModel.trim(),
    thinkingSpeed: isThinkingSpeed(candidate.thinkingSpeed)
      ? candidate.thinkingSpeed
      : DEFAULT_THINKING_SPEED,
  };
}
