import type { Dream } from "@shared/dreams";

export const DEFAULT_INTEREST_MATCH_LIMIT = 3;

export type DreamInterestMatch = {
  kicker: string;
  tags: string[];
  truncated: boolean;
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function describeDreamInterestMatch(
  dream: Dream,
  profileInterests: readonly string[],
  limit: number = DEFAULT_INTEREST_MATCH_LIMIT,
): DreamInterestMatch | null {
  const wanted = new Set<string>();
  for (const raw of profileInterests) {
    const n = normalize(raw);
    if (n.length > 0) wanted.add(n);
  }
  if (wanted.size === 0) return null;

  const seen = new Set<string>();
  const matched: string[] = [];
  for (const raw of dream.interest_tags) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (!wanted.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(trimmed);
  }
  if (matched.length === 0) return null;

  const effectiveLimit = limit > 0 ? limit : matched.length;
  const tags = matched.slice(0, effectiveLimit);
  return {
    kicker: "For you",
    tags,
    truncated: matched.length > tags.length,
  };
}
