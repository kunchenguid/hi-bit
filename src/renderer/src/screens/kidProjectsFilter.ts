import { DREAM_CATEGORIES, type DreamCategory } from "@shared/dreams";
import type { KidProjectListEntry } from "./kidProjectsList";

export type KidProjectsFilter = "all" | DreamCategory;

export const KID_PROJECTS_FILTERS: readonly KidProjectsFilter[] = [
  "all",
  ...DREAM_CATEGORIES,
] as const;

export function filterKidProjectsByCategory(
  entries: readonly KidProjectListEntry[],
  filter: KidProjectsFilter,
): KidProjectListEntry[] {
  if (filter === "all") return [...entries];
  return entries.filter((e) => e.categories.includes(filter));
}

export function countKidProjectsByCategoryFilter(
  entries: readonly KidProjectListEntry[],
): Record<KidProjectsFilter, number> {
  const counts: Record<KidProjectsFilter, number> = {
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
