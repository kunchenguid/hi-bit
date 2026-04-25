import type { ParentFlagOverviewEntry } from "./parentFlagsList";

export function normalizeParentFlagsSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchParentFlagsByText(
  entries: readonly ParentFlagOverviewEntry[],
  query: string,
): ParentFlagOverviewEntry[] {
  const normalized = normalizeParentFlagsSearchQuery(query);
  if (normalized.length === 0) return [...entries];
  const tokens = normalized.split(" ");
  return entries.filter((e) => {
    const haystack = `${e.flag.messageText} ${e.flag.reason} ${e.speakerLabel}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
