import type { Dream } from "@shared/dreams";
import { expandInterests } from "./interestAliases";

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function scoreDreamInterestMatch(dream: Dream, profileInterests: readonly string[]): number {
  const wanted = expandInterests(profileInterests);
  if (wanted.size === 0) return 0;

  const seen = new Set<string>();
  let count = 0;
  for (const raw of dream.interest_tags) {
    const key = normalize(raw);
    if (key.length === 0) continue;
    if (!wanted.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}
