import type { ExpectedLearnerAction } from "./learnerActivity";

export type SendMessageResult =
  | { ok: true; text: string; durationMs: number; expectedActions?: ExpectedLearnerAction[] }
  | { ok: false; error: string; durationMs: number };

export type CursorMarkerRequest = {
  filename: string;
  editorContent: string;
  latestBitMessage: string;
  snippet: string;
};
