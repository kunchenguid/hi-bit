import type { RecentSessionsOverviewEntry } from "./recentSessionsSummary";

export function normalizeRecentSessionsSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchRecentSessionsByText(
  entries: readonly RecentSessionsOverviewEntry[],
  query: string,
): RecentSessionsOverviewEntry[] {
  const normalized = normalizeRecentSessionsSearchQuery(query);
  if (normalized.length === 0) return [...entries];
  const tokens = normalized.split(" ");
  return entries.filter((e) => {
    const haystack = `${e.role} ${e.harness} ${e.sessionId} ${e.firstAt} ${e.lastAt}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
