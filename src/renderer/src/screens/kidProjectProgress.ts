import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { computeDreamReadiness } from "./dreamReadiness";

export type KidProjectProgressDescription = {
  kicker: string;
  text: string;
  allReady: boolean;
};

export function describeKidProjectProgress(
  dream: Dream | null,
  graph: KnowledgeGraph | null,
  progress: Progress | null,
): KidProjectProgressDescription | null {
  if (!dream) return null;
  const readiness = computeDreamReadiness(dream, graph, progress);
  if (readiness.requiredCount === 0) return null;
  if (readiness.allReady) {
    return { kicker: "skills", text: "ready to finish!", allReady: true };
  }
  if (readiness.readyCount === 0) return null;
  return {
    kicker: "skills",
    text: `${readiness.readyCount} of ${readiness.requiredCount} ready`,
    allReady: false,
  };
}
