import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { kpMeets } from "@shared/scheduler";

export type DreamReadiness = {
  requiredCount: number;
  readyCount: number;
  unknownCount: number;
  allReady: boolean;
};

export function computeDreamReadiness(
  dream: Dream,
  graph: KnowledgeGraph | null,
  progress: Progress | null,
): DreamReadiness {
  const requiredCount = dream.requires.length;
  if (requiredCount === 0) {
    return { requiredCount: 0, readyCount: 0, unknownCount: 0, allReady: true };
  }
  if (!progress) {
    return { requiredCount, readyCount: 0, unknownCount: 0, allReady: false };
  }
  let readyCount = 0;
  let unknownCount = 0;
  for (const id of dream.requires) {
    if (graph && !graph.byId[id]) {
      unknownCount += 1;
      continue;
    }
    if (kpMeets(progress, id, "did_with_help")) readyCount += 1;
  }
  return {
    requiredCount,
    readyCount,
    unknownCount,
    allReady: readyCount + unknownCount === requiredCount && unknownCount === 0,
  };
}

export function describeDreamReadiness(readiness: DreamReadiness): string {
  if (readiness.requiredCount === 0) return "Ready to build!";
  if (readiness.allReady) return "Ready to build!";
  const skillLabel = readiness.requiredCount === 1 ? "skill" : "skills";
  if (readiness.readyCount === 0)
    return `Bit will teach ${readiness.requiredCount} new ${skillLabel}`;
  return `You know ${readiness.readyCount} of ${readiness.requiredCount} skills`;
}
