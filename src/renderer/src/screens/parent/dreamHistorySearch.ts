import type { DreamHistoryEntry } from "./dreamHistoryList";

export function normalizeDreamHistorySearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchDreamHistoryByText(
  entries: readonly DreamHistoryEntry[],
  query: string,
): DreamHistoryEntry[] {
  const normalized = normalizeDreamHistorySearchQuery(query);
  if (normalized.length === 0) return [...entries];
  const tokens = normalized.split(" ");
  return entries.filter((e) => {
    const haystack = [e.title, e.dreamId, e.categories.join(" ")].join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
