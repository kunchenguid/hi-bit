import type { HarnessInvocationLogEntry } from "@shared/sessionLog";

export type SessionTokens = {
  tokensInput: number;
  tokensOutput: number;
  total: number;
};

export function describeSessionTokens(
  entries: HarnessInvocationLogEntry[] | null | undefined,
): SessionTokens | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let tokensInput = 0;
  let tokensOutput = 0;
  let anyRecorded = false;
  for (const entry of entries) {
    if (typeof entry.tokensInput === "number" && Number.isFinite(entry.tokensInput)) {
      tokensInput += Math.max(0, entry.tokensInput);
      anyRecorded = true;
    }
    if (typeof entry.tokensOutput === "number" && Number.isFinite(entry.tokensOutput)) {
      tokensOutput += Math.max(0, entry.tokensOutput);
      anyRecorded = true;
    }
  }
  if (!anyRecorded) return null;
  if (tokensInput === 0 && tokensOutput === 0) return null;
  return { tokensInput, tokensOutput, total: tokensInput + tokensOutput };
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
