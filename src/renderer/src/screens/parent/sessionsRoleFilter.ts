import type { RecentSessionsOverviewEntry } from "./recentSessionsSummary";

export type SessionsRoleFilter = "all" | "kid" | "parent";

export const SESSIONS_ROLE_FILTERS: readonly SessionsRoleFilter[] = [
  "all",
  "kid",
  "parent",
] as const;

export const SESSIONS_ROLE_FILTER_LABELS: Record<SessionsRoleFilter, string> = {
  all: "all",
  kid: "kid",
  parent: "parent",
};

export function filterRecentSessionsByRole(
  entries: readonly RecentSessionsOverviewEntry[],
  filter: SessionsRoleFilter,
): RecentSessionsOverviewEntry[] {
  if (filter === "all") return [...entries];
  return entries.filter((e) => e.role === filter);
}

export function countRecentSessionsByRoleFilter(
  entries: readonly RecentSessionsOverviewEntry[],
): Record<SessionsRoleFilter, number> {
  const counts: Record<SessionsRoleFilter, number> = {
    all: entries.length,
    kid: 0,
    parent: 0,
  };
  for (const entry of entries) {
    if (entry.role === "kid") counts.kid += 1;
    else if (entry.role === "parent") counts.parent += 1;
  }
  return counts;
}
