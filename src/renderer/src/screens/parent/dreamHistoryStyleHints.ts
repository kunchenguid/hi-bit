import type { DreamLibrary } from "@shared/dreams";
import type { DreamHistoryEntry } from "./dreamHistoryList";

export function describeDreamHistoryStyleHints(
  entry: DreamHistoryEntry | null | undefined,
  library: DreamLibrary | null,
): string[] | null {
  if (!entry || !library) return null;
  const dreamId = entry.dreamId;
  if (typeof dreamId !== "string" || dreamId.length === 0) return null;
  const dream = library.byId[dreamId];
  if (!dream) return null;
  const raw = dream.style_hints;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const hints: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(trimmed);
  }
  return hints.length > 0 ? hints : null;
}
