import type { HarnessInvocationLogEntry } from "@shared/sessionLog";

export type SessionFailures = {
  failureCount: number;
  totalTurns: number;
};

export function describeSessionFailures(
  entries: HarnessInvocationLogEntry[] | null | undefined,
): SessionFailures | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let failureCount = 0;
  for (const entry of entries) {
    if (entry.exitCode !== 0 || entry.signal !== null) failureCount += 1;
  }
  if (failureCount === 0) return null;
  return { failureCount, totalTurns: entries.length };
}
