export type SendMessageResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };

export type CursorMarkerRequest = {
  filename: string;
  editorContent: string;
  latestBitMessage: string;
};
