import type { ParentProjectRow } from "./parentProjectRows";
import { describeParentRelativeTime } from "./parentRelativeTime";

export type ProjectStarted = {
  startedAt: string;
  relative: string;
};

export type DescribeProjectStartedOptions = {
  now?: Date;
};

export function describeProjectStarted(
  row: ParentProjectRow | null | undefined,
  options: DescribeProjectStartedOptions = {},
): ProjectStarted | null {
  if (!row) return null;
  const startedAt = row.startedAt;
  if (typeof startedAt !== "string" || startedAt.length === 0) return null;
  const parsed = new Date(startedAt).getTime();
  if (Number.isNaN(parsed)) return null;
  if (startedAt === row.lastActiveAt) return null;
  const relative = describeParentRelativeTime(startedAt, options.now);
  if (relative.length === 0) return null;
  return { startedAt, relative };
}
