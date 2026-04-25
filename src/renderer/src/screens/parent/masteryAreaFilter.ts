import type { KnowledgePoint, KnowledgePointArea } from "@shared/knowledgeGraph";
import { KP_AREAS } from "@shared/knowledgeGraph";

export type MasteryAreaFilter = "all" | KnowledgePointArea;

export const MASTERY_AREA_FILTERS = [
  "all",
  ...KP_AREAS,
] as const satisfies readonly MasteryAreaFilter[];

export const MASTERY_AREA_FILTER_LABELS: Record<MasteryAreaFilter, string> = {
  all: "all",
  html: "HTML",
  css: "CSS",
  js: "JavaScript",
  dom: "DOM",
  canvas: "Canvas",
  interactivity: "Interactivity",
};

export function filterKpsByArea(
  nodes: readonly KnowledgePoint[],
  filter: MasteryAreaFilter,
): KnowledgePoint[] {
  if (filter === "all") return [...nodes];
  return nodes.filter((n) => n.area === filter);
}

export function countKpsByAreaFilter(
  nodes: readonly KnowledgePoint[],
): Record<MasteryAreaFilter, number> {
  const counts: Record<MasteryAreaFilter, number> = {
    all: nodes.length,
    html: 0,
    css: 0,
    js: 0,
    dom: 0,
    canvas: 0,
    interactivity: 0,
  };
  for (const node of nodes) {
    counts[node.area] += 1;
  }
  return counts;
}
