import type { KidProjectListEntry } from "./kidProjectsList";

export function normalizeKidProjectsSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchKidProjectsByText(
  entries: KidProjectListEntry[],
  query: string,
): KidProjectListEntry[] {
  const normalized = normalizeKidProjectsSearchQuery(query);
  if (normalized.length === 0) return entries;
  const tokens = normalized.split(" ");
  return entries.filter((e) => {
    const haystack = [e.title, e.summary ?? "", e.dreamId, e.slug, e.categories.join(" ")]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
