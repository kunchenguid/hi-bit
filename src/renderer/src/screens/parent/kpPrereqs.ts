import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { isKpSkipped, kpLevel } from "@shared/scheduler";

export type KpPrereqState = "mastered" | "inProgress" | "notStarted";

export type KpPrereqChip = {
  id: string;
  title: string;
  state: KpPrereqState;
  known: boolean;
};

function classifyPrereqState(progress: Progress | null | undefined, id: string): KpPrereqState {
  if (!progress) return "notStarted";
  if (isKpSkipped(progress, id)) return "mastered";
  const level = kpLevel(progress, id);
  if (level === "did_with_help" || level === "did_unprompted" || level === "explained_it") {
    return "mastered";
  }
  if (level === "saw_it") return "inProgress";
  return "notStarted";
}

export function describeKpPrereqs(
  kp: KnowledgePoint | null | undefined,
  graph: KnowledgeGraph | null | undefined,
  progress: Progress | null | undefined,
): KpPrereqChip[] | null {
  if (!kp) return null;
  const raw = kp.prereqs;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const chips: KpPrereqChip[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    const node = graph?.byId[trimmed];
    chips.push({
      id: trimmed,
      title: node?.title_parent ?? trimmed,
      state: classifyPrereqState(progress, trimmed),
      known: Boolean(node),
    });
  }
  return chips.length > 0 ? chips : null;
}
