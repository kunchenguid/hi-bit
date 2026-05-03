import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { isKpSkipped, kpMeets } from "@shared/scheduler";

export type KidSessionLearning = {
  id: string;
  titleKid: string;
};

export type KidSessionLearnedSummary = {
  count: number;
  items: KidSessionLearning[];
  text: string;
};

export function computeDoneKpIds(
  graph: KnowledgeGraph | null,
  progress: Progress | null,
): Set<string> {
  const done = new Set<string>();
  if (!graph || !progress) return done;
  for (const node of graph.nodes) {
    if (isKpSkipped(progress, node.id)) continue;
    if (kpMeets(progress, node.id, "did_with_help")) done.add(node.id);
  }
  return done;
}

function joinTitles(titles: readonly string[]): string {
  if (titles.length === 1) return titles[0] ?? "";
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  const head = titles.slice(0, -1).join(", ");
  const tail = titles[titles.length - 1];
  return `${head}, and ${tail}`;
}

export function buildKidSessionLearned(
  graph: KnowledgeGraph | null,
  progress: Progress | null,
  sessionStartDoneKpIds: ReadonlySet<string> | null,
): KidSessionLearnedSummary | null {
  if (!graph || !progress || !sessionStartDoneKpIds) return null;
  const currentDone = computeDoneKpIds(graph, progress);
  const items: KidSessionLearning[] = [];
  for (const node of graph.nodes) {
    if (!currentDone.has(node.id)) continue;
    if (sessionStartDoneKpIds.has(node.id)) continue;
    items.push({ id: node.id, titleKid: node.title_kid });
  }
  if (items.length === 0) return null;
  const count = items.length;
  const noun = count === 1 ? "skill" : "skills";
  const titlesText = joinTitles(items.map((i) => i.titleKid));
  return {
    count,
    items,
    text: `New ${noun} learned: ${titlesText}.`,
  };
}
