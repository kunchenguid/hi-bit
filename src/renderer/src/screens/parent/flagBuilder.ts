import type { ParentFlag } from "@shared/flag";
import type { TranscriptEvent } from "@shared/transcript";

export type BuildFlagResult = { ok: true; flag: ParentFlag } | { ok: false; error: string };

export function buildFlagFromEvent(
  event: TranscriptEvent,
  sessionId: string,
  reason: string,
  now: () => Date = () => new Date(),
): BuildFlagResult {
  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    return { ok: false, error: "Add a short reason so Bit knows what to avoid." };
  }
  if (event.text.trim().length === 0) {
    return { ok: false, error: "This message has no text to flag." };
  }
  if (sessionId.length === 0) {
    return { ok: false, error: "Session is missing." };
  }
  return {
    ok: true,
    flag: {
      flaggedAt: now().toISOString(),
      sessionId,
      messageTimestamp: event.timestamp,
      messageRole: event.role,
      messageKind: event.kind,
      messageText: event.text,
      reason: trimmedReason,
    },
  };
}

export function findMatchingFlag(
  flags: ParentFlag[],
  event: TranscriptEvent,
  sessionId: string,
): ParentFlag | undefined {
  return flags.find(
    (f) =>
      f.sessionId === sessionId &&
      f.messageTimestamp === event.timestamp &&
      f.messageText === event.text,
  );
}
