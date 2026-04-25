import type { ParentFlag } from "@shared/flag";
import type { ParentFlagOverviewEntry } from "./parentFlagsList";

export type ParentFlagsFilter = "all" | "kid" | "bit" | "parent";

export const PARENT_FLAGS_FILTERS: readonly ParentFlagsFilter[] = [
  "all",
  "kid",
  "bit",
  "parent",
] as const;

export const PARENT_FLAGS_FILTER_LABELS: Record<ParentFlagsFilter, string> = {
  all: "all",
  kid: "kid",
  bit: "bit",
  parent: "parent",
};

function matchesSpeaker(flag: ParentFlag, filter: Exclude<ParentFlagsFilter, "all">): boolean {
  if (filter === "bit") return flag.messageKind === "assistant_message";
  if (filter === "kid") {
    return flag.messageKind === "user_message" && flag.messageRole === "kid";
  }
  return flag.messageKind === "user_message" && flag.messageRole === "parent";
}

export function filterParentFlagsBySpeaker(
  entries: readonly ParentFlagOverviewEntry[],
  filter: ParentFlagsFilter,
): ParentFlagOverviewEntry[] {
  if (filter === "all") return [...entries];
  return entries.filter((e) => matchesSpeaker(e.flag, filter));
}

export function countParentFlagsBySpeakerFilter(
  entries: readonly ParentFlagOverviewEntry[],
): Record<ParentFlagsFilter, number> {
  const counts: Record<ParentFlagsFilter, number> = {
    all: entries.length,
    kid: 0,
    bit: 0,
    parent: 0,
  };
  for (const entry of entries) {
    if (matchesSpeaker(entry.flag, "kid")) counts.kid += 1;
    else if (matchesSpeaker(entry.flag, "bit")) counts.bit += 1;
    else if (matchesSpeaker(entry.flag, "parent")) counts.parent += 1;
  }
  return counts;
}
