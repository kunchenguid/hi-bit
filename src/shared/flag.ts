import type { SessionRole } from "./sessionLog";
import type { TranscriptEventKind } from "./transcript";

export type ParentFlag = {
  flaggedAt: string;
  sessionId: string;
  messageTimestamp: string;
  messageRole: SessionRole;
  messageKind: TranscriptEventKind;
  messageText: string;
  reason: string;
};
