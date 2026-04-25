import type { Progress } from "@shared/progress";
import { describeParentRelativeTime } from "./parentRelativeTime";

export type KpMasteryUpdated = {
  updatedAt: string;
  relative: string;
};

export type DescribeKpMasteryUpdatedOptions = {
  now?: Date;
};

export function describeKpMasteryUpdated(
  progress: Progress | null,
  kpId: string,
  options: DescribeKpMasteryUpdatedOptions = {},
): KpMasteryUpdated | null {
  if (!progress) return null;
  if (typeof kpId !== "string" || kpId.length === 0) return null;
  const entry = progress.knowledgePoints[kpId];
  if (!entry) return null;
  const updatedAt = entry.updatedAt;
  if (typeof updatedAt !== "string" || updatedAt.length === 0) return null;
  const parsed = new Date(updatedAt).getTime();
  if (Number.isNaN(parsed)) return null;
  const relative = describeParentRelativeTime(updatedAt, options.now);
  if (relative.length === 0) return null;
  return { updatedAt, relative };
}
