export type DreamCurrentMarker = {
  kicker: string;
  text: string;
};

export function describeDreamCurrentMarker(
  dreamId: string,
  currentDreamId: string | null | undefined,
): DreamCurrentMarker | null {
  if (!currentDreamId) return null;
  if (dreamId.trim().length === 0) return null;
  if (dreamId !== currentDreamId) return null;
  return { kicker: "current", text: "you're building this now" };
}
