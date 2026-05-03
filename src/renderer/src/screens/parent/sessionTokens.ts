import type { HarnessInvocationLogEntry } from "@shared/sessionLog";

export type SessionTokens = {
  tokensInput: number;
  tokensOutput: number;
  total: number;
  contextTokensUsed?: number;
  contextTokensSize?: number;
};

export function describeSessionTokens(
  entries: HarnessInvocationLogEntry[] | null | undefined,
): SessionTokens | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let tokensInput = 0;
  let tokensOutput = 0;
  let contextTokensUsed: number | undefined;
  let contextTokensSize: number | undefined;
  let anyRecorded = false;
  let anyContextRecorded = false;
  for (const entry of entries) {
    if (typeof entry.tokensInput === "number" && Number.isFinite(entry.tokensInput)) {
      tokensInput += Math.max(0, entry.tokensInput);
      anyRecorded = true;
    }
    if (typeof entry.tokensOutput === "number" && Number.isFinite(entry.tokensOutput)) {
      tokensOutput += Math.max(0, entry.tokensOutput);
      anyRecorded = true;
    }
    if (typeof entry.contextTokensUsed === "number" && Number.isFinite(entry.contextTokensUsed)) {
      contextTokensUsed = Math.max(0, entry.contextTokensUsed);
      anyContextRecorded = true;
    }
    if (typeof entry.contextTokensSize === "number" && Number.isFinite(entry.contextTokensSize)) {
      contextTokensSize = Math.max(0, entry.contextTokensSize);
    }
  }
  if (!anyRecorded && !anyContextRecorded) return null;
  const tokenTotal = tokensInput + tokensOutput;
  const contextTotal = contextTokensUsed ?? 0;
  if (tokenTotal === 0 && contextTotal === 0) return null;
  return {
    tokensInput,
    tokensOutput,
    total: tokenTotal > 0 ? tokenTotal : contextTotal,
    ...(contextTokensUsed !== undefined ? { contextTokensUsed } : {}),
    ...(contextTokensSize !== undefined ? { contextTokensSize } : {}),
  };
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  const m = n / 1_000_000;
  return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
}
