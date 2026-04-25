import { DREAM_CATEGORIES, type DreamCategory } from "@shared/dreams";
import type { DreamHistoryEntry } from "./dreamHistoryList";

export type DreamHistoryFilter = "all" | DreamCategory;

export const DREAM_HISTORY_FILTERS: readonly DreamHistoryFilter[] = [
  "all",
  ...DREAM_CATEGORIES,
] as const;

export function filterDreamHistoryByCategory(
  entries: readonly DreamHistoryEntry[],
  filter: DreamHistoryFilter,
): DreamHistoryEntry[] {
  if (filter === "all") return [...entries];
  return entries.filter((e) => e.categories.includes(filter));
}

export function countDreamHistoryByCategoryFilter(
  entries: readonly DreamHistoryEntry[],
): Record<DreamHistoryFilter, number> {
  const counts: Record<DreamHistoryFilter, number> = {
    all: entries.length,
    arcade: 0,
    creative: 0,
    personal: 0,
    utility: 0,
    art: 0,
  };
  for (const entry of entries) {
    const seen = new Set<DreamCategory>();
    for (const category of entry.categories) {
      if (seen.has(category)) continue;
      seen.add(category);
      counts[category] += 1;
    }
  }
  return counts;
}
