const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function describeKidRelativeTime(iso: string, now: Date = new Date()): string | null {
  if (typeof iso !== "string" || iso.trim().length === 0) return null;
  const then = new Date(iso);
  const millis = then.getTime();
  if (Number.isNaN(millis)) return null;

  const diffDays = Math.floor((startOfUtcDay(now) - startOfUtcDay(then)) / MS_PER_DAY);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "last week";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return "a while back";
}
