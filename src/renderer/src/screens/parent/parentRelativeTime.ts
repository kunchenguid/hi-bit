const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const JUST_NOW_THRESHOLD_MS = 30 * 1000;

export function describeParentRelativeTime(iso: string, now: Date = new Date()): string {
  if (typeof iso !== "string") return "";
  if (iso.length === 0) return "";
  const then = new Date(iso);
  const millis = then.getTime();
  if (Number.isNaN(millis)) return iso;
  const diffMs = now.getTime() - millis;
  if (diffMs < JUST_NOW_THRESHOLD_MS) return "Just now";
  if (diffMs < MS_PER_HOUR) {
    const mins = Math.floor(diffMs / MS_PER_MINUTE);
    return mins === 1 ? "1 minute ago" : `${mins} minutes ago`;
  }
  if (diffMs < MS_PER_DAY) {
    const hrs = Math.floor(diffMs / MS_PER_HOUR);
    return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
  }
  if (diffMs < 7 * MS_PER_DAY) {
    const days = Math.floor(diffMs / MS_PER_DAY);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return then.toLocaleString();
}
