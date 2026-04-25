import type { KnowledgePoint } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import {
  categorizeKpForSummary,
  type MasteryCategory,
  type MasterySummary,
} from "./masterySummary";

export type MasteryFilter = "all" | MasteryCategory;

export const MASTERY_FILTERS = [
  "all",
  "mastered",
  "inProgress",
  "notStarted",
  "skipped",
] as const satisfies readonly MasteryFilter[];

export const MASTERY_FILTER_LABELS: Record<MasteryFilter, string> = {
  all: "all",
  mastered: "mastered",
  inProgress: "in progress",
  notStarted: "not started",
  skipped: "skipped",
};

export function filterKpsByMasteryStatus(
  nodes: readonly KnowledgePoint[],
  progress: Progress | null,
  filter: MasteryFilter,
): KnowledgePoint[] {
  if (filter === "all") return [...nodes];
  return nodes.filter((n) => categorizeKpForSummary(progress, n.id) === filter);
}

export function countMasteryFilterMatches(summary: MasterySummary): Record<MasteryFilter, number> {
  return {
    all: summary.total,
    mastered: summary.mastered,
    inProgress: summary.inProgress,
    notStarted: summary.notStarted,
    skipped: summary.skipped,
  };
}
