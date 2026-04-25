import type { DreamLibrary } from "@shared/dreams";
import type { DreamHistoryEntry } from "./dreamHistoryList";

export function describeDreamHistoryInterests(
  entry: DreamHistoryEntry | null | undefined,
  library: DreamLibrary | null,
): string[] | null {
  if (!entry || !library) return null;
  const dreamId = entry.dreamId;
  if (typeof dreamId !== "string" || dreamId.length === 0) return null;
  const dream = library.byId[dreamId];
  if (!dream) return null;
  const raw = dream.interest_tags;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(trimmed);
  }
  return tags.length > 0 ? tags : null;
}
