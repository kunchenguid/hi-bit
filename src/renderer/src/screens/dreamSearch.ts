import type { Dream } from "@shared/dreams";

export function normalizeDreamSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchDreamsByText(dreams: Dream[], query: string): Dream[] {
  const normalized = normalizeDreamSearchQuery(query);
  if (normalized.length === 0) return dreams;
  const tokens = normalized.split(" ");
  return dreams.filter((d) => {
    const haystack = [
      d.title_kid,
      d.title_parent,
      d.summary_kid,
      d.categories.join(" "),
      d.interest_tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
