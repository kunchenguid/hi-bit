export type SendMessageResult =
  | { ok: true; text: string; durationMs: number }
  | { ok: false; error: string; durationMs: number };
