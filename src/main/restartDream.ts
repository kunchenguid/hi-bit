import type { Dream, DreamValidation } from "@shared/dreams";

export function requireRestartDream(result: DreamValidation, dreamId: string): Dream {
  if (!result.ok) {
    throw new Error("Dream library is invalid");
  }
  const dream = result.library.byId[dreamId];
  if (!dream) {
    throw new Error(`Unknown dream: ${dreamId}`);
  }
  return dream;
}
