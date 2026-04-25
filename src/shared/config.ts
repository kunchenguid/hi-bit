export type HarnessId = "claude" | "codex" | "opencode";

export const HARNESS_IDS = ["claude", "codex", "opencode"] as const satisfies readonly HarnessId[];

// The harness Hi-Bit's first alpha ships against as the reference integration.
// All three harnesses remain wired symmetrically; this constant only drives the
// "Recommended" hint in the onboarding picker and answers the PRD open question
// about which integration ships first.
export const REFERENCE_HARNESS: HarnessId = "claude";

export type HarnessBinaries = {
  [K in HarnessId]?: string;
};

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
  version: 1;
  harness: HarnessBinaries;
  defaultHarness?: HarnessId;
  parentPin?: ParentPinRecord;
  theme?: ThemePreference;
};

export type HarnessDetection = {
  [K in HarnessId]: string | null;
};

export function defaultConfig(): HiBitConfig {
  return {
    version: 1,
    harness: {},
  };
}
