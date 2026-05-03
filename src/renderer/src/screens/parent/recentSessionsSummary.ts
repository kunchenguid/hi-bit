import type { AgentId } from "@shared/config";
import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";

export type RecentSessionsOverviewEntry = {
  sessionId: string;
  role: SessionRole;
  harness: AgentId;
  firstAt: string;
  lastAt: string;
  turnCount: number;
  totalDurationMs: number;
};

export type RecentSessionsTotals = {
  totalSessions: number;
  kidSessions: number;
  parentSessions: number;
  totalDurationMs: number;
};

export type RecentSessionsSummary = {
  rows: RecentSessionsOverviewEntry[];
  totals: RecentSessionsTotals;
};

export const DEFAULT_RECENT_SESSIONS_LIMIT = 5;

export function buildRecentSessionsSummary(
  entries: readonly HarnessInvocationLogEntry[],
  limit: number = DEFAULT_RECENT_SESSIONS_LIMIT,
): RecentSessionsSummary {
  const bySession = new Map<string, RecentSessionsOverviewEntry>();
  for (const entry of entries) {
    const existing = bySession.get(entry.sessionId);
    if (existing) {
      existing.turnCount += 1;
      existing.totalDurationMs += entry.durationMs;
      if (entry.timestamp < existing.firstAt) existing.firstAt = entry.timestamp;
      if (entry.timestamp > existing.lastAt) existing.lastAt = entry.timestamp;
    } else {
      bySession.set(entry.sessionId, {
        sessionId: entry.sessionId,
        role: entry.role,
        harness: entry.harness,
        firstAt: entry.timestamp,
        lastAt: entry.timestamp,
        turnCount: 1,
        totalDurationMs: entry.durationMs,
      });
    }
  }
  const allRows = Array.from(bySession.values());
  const sorted = allRows.slice().sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const rows = limit > 0 ? sorted.slice(0, limit) : sorted;

  let kidSessions = 0;
  let parentSessions = 0;
  let totalDurationMs = 0;
  for (const row of allRows) {
    if (row.role === "kid") kidSessions += 1;
    else parentSessions += 1;
    totalDurationMs += row.totalDurationMs;
  }
  return {
    rows,
    totals: {
      totalSessions: allRows.length,
      kidSessions,
      parentSessions,
      totalDurationMs,
    },
  };
}
