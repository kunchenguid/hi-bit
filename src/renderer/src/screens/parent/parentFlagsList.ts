import type { ParentFlag } from "@shared/flag";

export type ParentFlagOverviewEntry = {
  flag: ParentFlag;
  speakerLabel: string;
  preview: string;
};

export const FLAG_PREVIEW_MAX_CHARS = 140;

function speakerLabelFor(flag: ParentFlag): string {
  if (flag.messageKind === "assistant_message") return "Bit said";
  if (flag.messageKind === "user_message") {
    return flag.messageRole === "parent" ? "Parent said" : "Kid said";
  }
  return flag.messageKind.replace(/_/g, " ");
}

function previewFor(text: string): string {
  const oneLine = text.replace(/\s*\n+\s*/g, " ").trim();
  if (oneLine.length <= FLAG_PREVIEW_MAX_CHARS) return oneLine;
  return `${oneLine.slice(0, FLAG_PREVIEW_MAX_CHARS - 3).trimEnd()}...`;
}

export function buildParentFlagsOverview(flags: readonly ParentFlag[]): ParentFlagOverviewEntry[] {
  const sorted = flags.slice().sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt));
  return sorted.map((flag) => ({
    flag,
    speakerLabel: speakerLabelFor(flag),
    preview: previewFor(flag.messageText),
  }));
}
