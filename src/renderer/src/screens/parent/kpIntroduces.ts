import type { KnowledgePoint } from "@shared/knowledgeGraph";

export function describeKpIntroduces(kp: KnowledgePoint | null | undefined): string[] | null {
  if (!kp) return null;
  const raw = kp.introduces;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    tags.push(trimmed);
  }
  return tags.length > 0 ? tags : null;
}
