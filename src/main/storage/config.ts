import { readFile, writeFile } from "node:fs/promises";
import {
  defaultConfig,
  HARNESS_IDS,
  type HarnessId,
  type HiBitConfig,
  type ParentPinRecord,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@shared/config";
import type { HiBitLayout } from "./layout";

export async function readConfig(layout: HiBitLayout): Promise<HiBitConfig> {
  try {
    const raw = await readFile(layout.configFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeConfig(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig();
    }
    throw err;
  }
}

export async function writeConfig(layout: HiBitLayout, config: HiBitConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  await writeFile(layout.configFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function loadOrInitConfig(layout: HiBitLayout): Promise<HiBitConfig> {
  try {
    await readFile(layout.configFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const fresh = defaultConfig();
      await writeConfig(layout, fresh);
      return fresh;
    }
    throw err;
  }
  return readConfig(layout);
}

function normalizeConfig(value: unknown): HiBitConfig {
  const base = defaultConfig();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  const harness: HiBitConfig["harness"] = {};
  const rawHarness = (raw.harness as Record<string, unknown>) ?? {};
  for (const id of HARNESS_IDS) {
    const entry = rawHarness[id];
    if (typeof entry === "string" && entry.length > 0) {
      harness[id] = entry;
    }
  }
  const defaultHarness =
    typeof raw.defaultHarness === "string" && isHarnessId(raw.defaultHarness)
      ? raw.defaultHarness
      : undefined;
  const parentPin = normalizeParentPin(raw.parentPin);
  const theme = normalizeTheme(raw.theme);
  return {
    version: 1,
    harness,
    ...(defaultHarness ? { defaultHarness } : {}),
    ...(parentPin ? { parentPin } : {}),
    ...(theme ? { theme } : {}),
  };
}

function normalizeTheme(value: unknown): ThemePreference | undefined {
  if (typeof value !== "string") return undefined;
  return (THEME_PREFERENCES as readonly string[]).includes(value)
    ? (value as ThemePreference)
    : undefined;
}

function normalizeParentPin(value: unknown): ParentPinRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.algorithm !== "pbkdf2-sha256") return undefined;
  const { iterations, keyLength, salt, hash } = raw;
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    typeof keyLength !== "number" ||
    !Number.isInteger(keyLength) ||
    keyLength <= 0 ||
    typeof salt !== "string" ||
    salt.length === 0 ||
    typeof hash !== "string" ||
    hash.length === 0
  ) {
    return undefined;
  }
  return { algorithm: "pbkdf2-sha256", iterations, keyLength, salt, hash };
}

function isHarnessId(value: string): value is HarnessId {
  return (HARNESS_IDS as readonly string[]).includes(value);
}
