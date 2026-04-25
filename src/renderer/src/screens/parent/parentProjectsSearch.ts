import type { ParentProjectRow } from "./parentProjectRows";

export function normalizeParentProjectsSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchParentProjectsByText(
  rows: readonly ParentProjectRow[],
  query: string,
): ParentProjectRow[] {
  const normalized = normalizeParentProjectsSearchQuery(query);
  if (normalized.length === 0) return [...rows];
  const tokens = normalized.split(" ");
  return rows.filter((row) => {
    const haystack = `${row.slug} ${row.dreamId ?? ""} ${row.title}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
