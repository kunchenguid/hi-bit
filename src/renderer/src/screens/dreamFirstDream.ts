import type { Dream } from "@shared/dreams";
import type { Progress } from "@shared/progress";

export type GreatFirstDreamMarker = {
  kicker: string;
  text: string;
};

const GREAT_FIRST_DREAM_PICK_COUNT = 3;

export function isFirstDreamPicker(progress: Progress | null): boolean {
  if (!progress) return true;
  if (progress.projects.length > 0) return false;
  if (progress.dreamHistory.length > 0) return false;
  if (Object.keys(progress.knowledgePoints).length > 0) return false;
  return true;
}

export function pickGreatFirstDreamIds(dreams: readonly Dream[]): Set<string> {
  const candidates = dreams.filter((d) => d.requires.length > 0);
  const sorted = [...candidates].sort((a, b) => {
    const byCount = a.requires.length - b.requires.length;
    if (byCount !== 0) return byCount;
    return a.id.localeCompare(b.id);
  });
  return new Set(sorted.slice(0, GREAT_FIRST_DREAM_PICK_COUNT).map((d) => d.id));
}

export function describeGreatFirstDream(): GreatFirstDreamMarker {
  return { kicker: "Great first dream", text: "a gentle place to start" };
}
