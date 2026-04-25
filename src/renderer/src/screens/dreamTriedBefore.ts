export type DreamTriedBeforeMarker = {
  kicker: string;
  text: string;
};

export function describeDreamTriedBefore(
  dreamId: string,
  dreamHistory: readonly string[],
  currentDreamId: string | null | undefined,
): DreamTriedBeforeMarker | null {
  if (dreamId.length === 0) return null;
  if (currentDreamId && dreamId === currentDreamId) return null;
  if (!dreamHistory.includes(dreamId)) return null;
  return { kicker: "tried before", text: "you've opened this dream" };
}
