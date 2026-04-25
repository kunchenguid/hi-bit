import type { DreamFilter } from "./dreamFilter";

export function mergeRecommendedDreamIds(
  greatFirstIds: ReadonlySet<string>,
  recommendedIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const id of greatFirstIds) out.add(id);
  for (const id of recommendedIds) out.add(id);
  return out;
}

export function isDreamPickerCollapsible(args: {
  filter: DreamFilter;
  query: string;
  recommendedDreamIds: ReadonlySet<string>;
}): boolean {
  if (args.filter !== "all") return false;
  if (args.query.trim().length > 0) return false;
  return args.recommendedDreamIds.size > 0;
}

export function pickFallbackRecommendedIds(args: {
  isFirstTimer: boolean;
  recommendedDreamIds: ReadonlySet<string>;
  greatFirstDreamIds: ReadonlySet<string>;
}): Set<string> {
  if (args.isFirstTimer) return new Set<string>();
  if (args.recommendedDreamIds.size > 0) return new Set<string>();
  return new Set(args.greatFirstDreamIds);
}
