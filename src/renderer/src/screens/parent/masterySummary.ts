import type { KnowledgeGraph, KnowledgePointArea } from "@shared/knowledgeGraph";
import { KP_AREAS } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { isKpSkipped, kpMeets } from "@shared/scheduler";

export type MasteryCategory = "mastered" | "inProgress" | "notStarted" | "skipped";

export type MasteryAreaSummary = {
  area: KnowledgePointArea;
  total: number;
  mastered: number;
  inProgress: number;
  notStarted: number;
  skipped: number;
};

export type MasterySummary = {
  areas: MasteryAreaSummary[];
  total: number;
  mastered: number;
  inProgress: number;
  notStarted: number;
  skipped: number;
};

export function categorizeKpForSummary(progress: Progress | null, kpId: string): MasteryCategory {
  if (!progress) return "notStarted";
  if (isKpSkipped(progress, kpId)) return "skipped";
  if (kpMeets(progress, kpId, "did_with_help")) return "mastered";
  if (progress.knowledgePoints[kpId]?.status === "saw_it") return "inProgress";
  return "notStarted";
}

function emptyArea(area: KnowledgePointArea): MasteryAreaSummary {
  return { area, total: 0, mastered: 0, inProgress: 0, notStarted: 0, skipped: 0 };
}

export function computeMasterySummary(
  graph: KnowledgeGraph | null,
  progress: Progress | null,
): MasterySummary {
  const byArea = new Map<KnowledgePointArea, MasteryAreaSummary>();
  for (const area of KP_AREAS) byArea.set(area, emptyArea(area));

  if (graph) {
    for (const node of graph.nodes) {
      const bucket = byArea.get(node.area);
      if (!bucket) continue;
      bucket.total += 1;
      const category = categorizeKpForSummary(progress, node.id);
      bucket[category] += 1;
    }
  }

  const areas = KP_AREAS.map((a) => byArea.get(a)).filter(
    (b): b is MasteryAreaSummary => b !== undefined && b.total > 0,
  );

  let total = 0;
  let mastered = 0;
  let inProgress = 0;
  let notStarted = 0;
  let skipped = 0;
  for (const a of areas) {
    total += a.total;
    mastered += a.mastered;
    inProgress += a.inProgress;
    notStarted += a.notStarted;
    skipped += a.skipped;
  }

  return { areas, total, mastered, inProgress, notStarted, skipped };
}
