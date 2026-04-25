import { describeParentRelativeTime } from "./parentRelativeTime";
import type { RecentSessionsOverviewEntry } from "./recentSessionsSummary";

export type SessionStarted = {
  startedAt: string;
  relative: string;
};

export type DescribeSessionStartedOptions = {
  now?: Date;
};

export function describeSessionStarted(
  row: RecentSessionsOverviewEntry | null | undefined,
  options: DescribeSessionStartedOptions = {},
): SessionStarted | null {
  if (!row) return null;
  const startedAt = row.firstAt;
  if (typeof startedAt !== "string" || startedAt.length === 0) return null;
  const parsed = new Date(startedAt).getTime();
  if (Number.isNaN(parsed)) return null;
  if (startedAt === row.lastAt) return null;
  const relative = describeParentRelativeTime(startedAt, options.now);
  if (relative.length === 0) return null;
  return { startedAt, relative };
}
