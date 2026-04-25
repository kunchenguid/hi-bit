import type { ParentFlag } from "@shared/flag";
import { describeParentRelativeTime } from "./parentRelativeTime";

export type FlagMessageTime = {
  messageTimestamp: string;
  relative: string;
};

export type DescribeFlagMessageTimeOptions = {
  now?: Date;
};

export function describeFlagMessageTime(
  flag: ParentFlag | null | undefined,
  options: DescribeFlagMessageTimeOptions = {},
): FlagMessageTime | null {
  if (!flag) return null;
  const messageTimestamp = flag.messageTimestamp;
  if (typeof messageTimestamp !== "string" || messageTimestamp.length === 0) return null;
  const parsed = new Date(messageTimestamp).getTime();
  if (Number.isNaN(parsed)) return null;
  if (messageTimestamp === flag.flaggedAt) return null;
  const relative = describeParentRelativeTime(messageTimestamp, options.now);
  if (relative.length === 0) return null;
  return { messageTimestamp, relative };
}
