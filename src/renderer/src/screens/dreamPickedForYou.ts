import type { Dream } from "@shared/dreams";
import { scoreDreamInterestMatch } from "./dreamInterestScore";

export type RecommendedDreamMarker = {
  kicker: string;
  text: string;
};

const RECOMMENDED_DREAM_PICK_COUNT = 3;

export function pickRecommendedDreamIds(
  dreams: readonly Dream[],
  profileInterests: readonly string[],
  isFirstTimer: boolean,
): Set<string> {
  if (isFirstTimer) return new Set<string>();
  if (profileInterests.length === 0) return new Set<string>();

  const scored = dreams
    .map((d) => ({ id: d.id, score: scoreDreamInterestMatch(d, profileInterests) }))
    .filter((entry) => entry.score > 0);
  if (scored.length === 0) return new Set<string>();

  scored.sort((a, b) => {
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    return a.id.localeCompare(b.id);
  });

  return new Set(scored.slice(0, RECOMMENDED_DREAM_PICK_COUNT).map((entry) => entry.id));
}

export function describeRecommendedDream(): RecommendedDreamMarker {
  return { kicker: "Picked for you", text: "matches what you said you like" };
}
