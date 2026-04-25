import type { DreamCategory, DreamLibrary } from "@shared/dreams";

export type DreamHistoryEntry = {
  dreamId: string;
  title: string;
  categories: readonly DreamCategory[];
  isCurrent: boolean;
  isKnown: boolean;
};

export type BuildDreamHistoryInput = {
  dreamHistory: string[];
  library: DreamLibrary | null;
  currentDreamId?: string | null;
};

export function buildDreamHistoryList(input: BuildDreamHistoryInput): DreamHistoryEntry[] {
  const { dreamHistory, library, currentDreamId } = input;
  const seen = new Set<string>();
  const entries: DreamHistoryEntry[] = [];
  for (let i = dreamHistory.length - 1; i >= 0; i -= 1) {
    const raw = dreamHistory[i];
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const dream = library?.byId[id] ?? null;
    entries.push({
      dreamId: id,
      title: dream?.title_parent ?? id,
      categories: dream?.categories ?? [],
      isCurrent: !!currentDreamId && id === currentDreamId,
      isKnown: dream !== null,
    });
  }
  return entries;
}
