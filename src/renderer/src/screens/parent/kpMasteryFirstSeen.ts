import type { Progress } from "@shared/progress";
import { describeParentRelativeTime } from "./parentRelativeTime";

export type KpMasteryFirstSeen = {
  firstSeenAt: string;
  relative: string;
};

export type DescribeKpMasteryFirstSeenOptions = {
  now?: Date;
};

export function describeKpMasteryFirstSeen(
  progress: Progress | null,
  kpId: string,
  options: DescribeKpMasteryFirstSeenOptions = {},
): KpMasteryFirstSeen | null {
  if (!progress) return null;
  if (typeof kpId !== "string" || kpId.length === 0) return null;
  const entry = progress.knowledgePoints[kpId];
  if (!entry) return null;
  const firstSeenAt = entry.firstSeenAt;
  if (typeof firstSeenAt !== "string" || firstSeenAt.length === 0) return null;
  const parsed = new Date(firstSeenAt).getTime();
  if (Number.isNaN(parsed)) return null;
  if (firstSeenAt === entry.updatedAt) return null;
  const relative = describeParentRelativeTime(firstSeenAt, options.now);
  if (relative.length === 0) return null;
  return { firstSeenAt, relative };
}
