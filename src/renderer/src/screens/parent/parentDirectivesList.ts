import type { ParentChatMessage } from "../../state/parentChatStore";

export type ParentDirectivesOverviewEntry = {
  id: string;
  text: string;
  preview: string;
  timestamp: string;
};

export const DIRECTIVE_PREVIEW_MAX_CHARS = 160;
export const DEFAULT_DIRECTIVES_LIMIT = 5;

function previewFor(text: string): string {
  const oneLine = text.replace(/\s*\n+\s*/g, " ").trim();
  if (oneLine.length <= DIRECTIVE_PREVIEW_MAX_CHARS) return oneLine;
  return `${oneLine.slice(0, DIRECTIVE_PREVIEW_MAX_CHARS - 3).trimEnd()}...`;
}

export function buildParentDirectivesOverview(
  messages: readonly ParentChatMessage[],
  limit: number = DEFAULT_DIRECTIVES_LIMIT,
): ParentDirectivesOverviewEntry[] {
  const directives = messages.filter((m) => m.role === "parent" && m.kind === "text");
  const sorted = directives.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const capped = limit > 0 ? sorted.slice(0, limit) : sorted;
  return capped.map((m) => ({
    id: m.id,
    text: m.text,
    preview: previewFor(m.text),
    timestamp: m.timestamp,
  }));
}
