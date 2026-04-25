import { DREAM_CATEGORIES, type Dream, type DreamCategory } from "@shared/dreams";

export type DreamFilter = "all" | DreamCategory;

export const DREAM_FILTERS: readonly DreamFilter[] = ["all", ...DREAM_CATEGORIES] as const;

export function filterDreamsByCategory(dreams: Dream[], filter: DreamFilter): Dream[] {
  if (filter === "all") return dreams;
  return dreams.filter((d) => d.categories.includes(filter));
}

export function countDreamsByCategoryFilter(dreams: readonly Dream[]): Record<DreamFilter, number> {
  const counts: Record<DreamFilter, number> = {
    all: dreams.length,
    arcade: 0,
    creative: 0,
    personal: 0,
    utility: 0,
    art: 0,
  };
  for (const dream of dreams) {
    const seen = new Set<DreamCategory>();
    for (const category of dream.categories) {
      if (seen.has(category)) continue;
      seen.add(category);
      counts[category] += 1;
    }
  }
  return counts;
}
