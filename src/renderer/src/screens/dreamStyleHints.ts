import type { Dream } from "@shared/dreams";

export const DEFAULT_STYLE_HINT_LIMIT = 3;

export type DreamStyleHintsSummary = {
  kicker: string;
  items: string[];
  truncated: boolean;
};

export function describeDreamStyleHints(
  dream: Dream,
  limit: number = DEFAULT_STYLE_HINT_LIMIT,
): DreamStyleHintsSummary | null {
  const cleaned: string[] = [];
  for (const raw of dream.style_hints) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length > 0) cleaned.push(trimmed);
  }
  if (cleaned.length === 0) return null;
  const effectiveLimit = limit > 0 ? limit : cleaned.length;
  const items = cleaned.slice(0, effectiveLimit);
  return {
    kicker: "Make it yours",
    items,
    truncated: cleaned.length > items.length,
  };
}
