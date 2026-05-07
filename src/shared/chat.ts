import type { ExpectedLearnerAction } from "./learnerActivity";

const UI_CONTEXT_OPEN = "<hi-bit:ui-context>\n";
const UI_CONTEXT_CLOSE = "\n</hi-bit:ui-context>";

export type SendMessageResult =
  | { ok: true; text: string; durationMs: number; expectedActions?: ExpectedLearnerAction[] }
  | { ok: false; error: string; durationMs: number };

export type CursorMarkerRequest = {
  filename: string;
  editorContent: string;
  latestBitMessage: string;
  snippet: string;
};

export function promptWithUiContext(prompt: string, uiContext?: string): string {
  const trimmedContext = uiContext?.trim();
  if (!trimmedContext) return prompt;
  return `${UI_CONTEXT_OPEN}${trimmedContext}${UI_CONTEXT_CLOSE}\n\n${prompt}`;
}

export function visiblePromptText(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith(UI_CONTEXT_OPEN)) return trimmed;
  const closeIndex = trimmed.indexOf(UI_CONTEXT_CLOSE, UI_CONTEXT_OPEN.length);
  if (closeIndex === -1) return trimmed;
  return trimmed.slice(closeIndex + UI_CONTEXT_CLOSE.length).trimStart();
}
