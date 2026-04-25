import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { KnowledgePointStatus, Progress } from "@shared/progress";

const LEVEL_ORDER: Record<KnowledgePointStatus, number> = {
  saw_it: 1,
  did_with_help: 2,
  did_unprompted: 3,
  explained_it: 4,
};

export function kpLevel(progress: Progress, kpId: string): KnowledgePointStatus | null {
  return progress.knowledgePoints[kpId]?.status ?? null;
}

export function isKpSkipped(progress: Progress, kpId: string): boolean {
  return progress.knowledgePoints[kpId]?.skipped === true;
}

export function kpMeets(
  progress: Progress,
  kpId: string,
  threshold: KnowledgePointStatus,
): boolean {
  if (isKpSkipped(progress, kpId)) return true;
  const level = kpLevel(progress, kpId);
  if (!level) return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[threshold];
}

export type RequiredKpsResult = {
  ordered: string[];
  unresolved: string[];
};

export function collectRequiredKps(graph: KnowledgeGraph, dream: Dream): RequiredKpsResult {
  const unresolvedSet = new Set<string>();
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const ordered: string[] = [];

  function dfs(id: string): void {
    if (visited.has(id) || onStack.has(id)) return;
    const node = graph.byId[id];
    if (!node) {
      unresolvedSet.add(id);
      return;
    }
    onStack.add(id);
    for (const prereq of node.prereqs) dfs(prereq);
    onStack.delete(id);
    visited.add(id);
    ordered.push(id);
  }

  for (const id of dream.requires) dfs(id);
  return { ordered, unresolved: [...unresolvedSet] };
}

export type DreamReadyOptions = {
  threshold?: KnowledgePointStatus;
};

export function isDreamDoable(
  dream: Dream,
  progress: Progress,
  options: DreamReadyOptions = {},
): boolean {
  const threshold = options.threshold ?? "did_with_help";
  for (const id of dream.requires) {
    if (!kpMeets(progress, id, threshold)) return false;
  }
  return true;
}

export type PickNextOptions = {
  prereqThreshold?: KnowledgePointStatus;
  taughtThreshold?: KnowledgePointStatus;
};

export function pickNextKP(
  graph: KnowledgeGraph,
  dream: Dream,
  progress: Progress,
  options: PickNextOptions = {},
): string | null {
  const prereqThreshold = options.prereqThreshold ?? "did_with_help";
  const taughtThreshold = options.taughtThreshold ?? "did_with_help";

  const { ordered } = collectRequiredKps(graph, dream);

  for (const id of ordered) {
    if (kpMeets(progress, id, taughtThreshold)) continue;
    const node = graph.byId[id];
    if (!node) continue;
    const unmetPrereq = node.prereqs.find((p) => !kpMeets(progress, p, prereqThreshold));
    if (unmetPrereq === undefined) return id;
  }

  return null;
}
