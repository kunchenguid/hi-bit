import type { KnowledgePoint } from "@shared/knowledgeGraph";

export function normalizeKpSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchKpsByText(nodes: KnowledgePoint[], query: string): KnowledgePoint[] {
  const normalized = normalizeKpSearchQuery(query);
  if (normalized.length === 0) return nodes;
  const tokens = normalized.split(" ");
  return nodes.filter((kp) => {
    const haystack = [kp.id, kp.title_parent, kp.title_kid, kp.area, kp.introduces.join(" ")]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
