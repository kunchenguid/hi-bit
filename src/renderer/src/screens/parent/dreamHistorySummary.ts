import type { DreamLibrary } from "@shared/dreams";
import type { DreamHistoryEntry } from "./dreamHistoryList";

export type DreamHistorySummary = {
  text: string;
  preview: string;
};

export const DREAM_HISTORY_SUMMARY_PREVIEW_MAX_CHARS = 120;

export function describeDreamHistorySummary(
  entry: DreamHistoryEntry | null | undefined,
  library: DreamLibrary | null,
): DreamHistorySummary | null {
  if (!entry || !library) return null;
  const dreamId = entry.dreamId;
  if (typeof dreamId !== "string" || dreamId.length === 0) return null;
  const dream = library.byId[dreamId];
  if (!dream) return null;
  const raw = dream.summary_kid;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0) return null;
  const collapsed = text.replace(/\s+/g, " ");
  const preview =
    collapsed.length > DREAM_HISTORY_SUMMARY_PREVIEW_MAX_CHARS
      ? `${collapsed.slice(0, DREAM_HISTORY_SUMMARY_PREVIEW_MAX_CHARS - 3)}...`
      : collapsed;
  return { text, preview };
}
