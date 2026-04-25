import type { ParentDirectivesOverviewEntry } from "./parentDirectivesList";

export function normalizeParentDirectivesSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchParentDirectivesByText(
  entries: readonly ParentDirectivesOverviewEntry[],
  query: string,
): ParentDirectivesOverviewEntry[] {
  const normalized = normalizeParentDirectivesSearchQuery(query);
  if (normalized.length === 0) return [...entries];
  const tokens = normalized.split(" ");
  return entries.filter((e) => {
    const haystack = e.text.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
