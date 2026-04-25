import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { computeDreamReadiness } from "./dreamReadiness";

export type KidDreamProgressDescription = {
  kicker: string;
  text: string;
};

export function describeKidDreamProgress(
  dream: Dream | null,
  graph: KnowledgeGraph | null,
  progress: Progress | null,
): KidDreamProgressDescription | null {
  if (!dream) return null;
  const readiness = computeDreamReadiness(dream, graph, progress);
  if (readiness.requiredCount === 0) return null;
  if (readiness.allReady) return null;
  if (readiness.readyCount === 0) return null;
  return {
    kicker: "dream",
    text: `${readiness.readyCount} of ${readiness.requiredCount} skills ready`,
  };
}
