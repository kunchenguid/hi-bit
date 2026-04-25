import type { SessionRole } from "./sessionLog";

export type TranscriptEventKind =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "error"
  | "system_event";

export type TranscriptEvent = {
  timestamp: string;
  role: SessionRole;
  sessionId: string;
  kind: TranscriptEventKind;
  text: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
};
