import type { DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { isKpSkipped, kpLevel } from "@shared/scheduler";
import type { DreamHistoryEntry } from "./dreamHistoryList";

export type DreamRequireState = "mastered" | "inProgress" | "notStarted";

export type DreamRequireChip = {
  id: string;
  title: string;
  state: DreamRequireState;
  known: boolean;
};

function classifyRequireState(
  progress: Progress | null | undefined,
  id: string,
): DreamRequireState {
  if (!progress) return "notStarted";
  if (isKpSkipped(progress, id)) return "mastered";
  const level = kpLevel(progress, id);
  if (level === "did_with_help" || level === "did_unprompted" || level === "explained_it") {
    return "mastered";
  }
  if (level === "saw_it") return "inProgress";
  return "notStarted";
}

export function describeDreamHistoryRequires(
  entry: DreamHistoryEntry | null | undefined,
  library: DreamLibrary | null,
  graph: KnowledgeGraph | null | undefined,
  progress: Progress | null | undefined,
): DreamRequireChip[] | null {
  if (!entry || !library) return null;
  const dreamId = entry.dreamId;
  if (typeof dreamId !== "string" || dreamId.length === 0) return null;
  const dream = library.byId[dreamId];
  if (!dream) return null;
  const raw = dream.requires;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const chips: DreamRequireChip[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    const node = graph?.byId[trimmed];
    chips.push({
      id: trimmed,
      title: node?.title_parent ?? trimmed,
      state: classifyRequireState(progress, trimmed),
      known: Boolean(node),
    });
  }
  return chips.length > 0 ? chips : null;
}
