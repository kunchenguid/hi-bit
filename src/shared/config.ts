export type AgentId = "claude" | "codex" | "opencode";

export const AGENT_IDS = ["claude", "codex", "opencode"] as const satisfies readonly AgentId[];

// The agent Hi-Bit's first alpha ships against as the reference integration.
// All three supported agents are invoked through ACPX; this only drives the
// "Recommended" hint in the onboarding picker.
export const REFERENCE_AGENT: AgentId = "claude";

export type ParentPinRecord = {
  algorithm: "pbkdf2-sha256";
  iterations: number;
  keyLength: number;
  salt: string;
  hash: string;
};

export type ThemePreference = "light" | "dark";

export const THEME_PREFERENCES = ["light", "dark"] as const satisfies readonly ThemePreference[];

export type HiBitConfig = {
  version: 2;
  defaultAgent?: AgentId;
  parentPin?: ParentPinRecord;
  theme?: ThemePreference;
};

export function defaultConfig(): HiBitConfig {
  return {
    version: 2,
  };
}
