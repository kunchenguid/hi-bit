import { describe, expect, it } from "vitest";
import { describeParentRelativeTime } from "./parentRelativeTime";

const REF = new Date("2026-04-23T15:00:00.000Z");

function isoMinutesAgo(minutes: number): string {
  const d = new Date(REF.getTime() - minutes * 60 * 1000);
  return d.toISOString();
}

function isoHoursAgo(hours: number): string {
  const d = new Date(REF.getTime() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

function isoDaysAgo(days: number): string {
  const d = new Date(REF.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

describe("describeParentRelativeTime", () => {
  it("returns the raw input for empty string", () => {
    expect(describeParentRelativeTime("", REF)).toBe("");
  });

  it("returns the raw input for an invalid timestamp", () => {
    expect(describeParentRelativeTime("not-a-date", REF)).toBe("not-a-date");
  });

  it("says 'Just now' for a sub-30-second-old timestamp", () => {
    const d = new Date(REF.getTime() - 5 * 1000);
    expect(describeParentRelativeTime(d.toISOString(), REF)).toBe("Just now");
  });

  it("says 'Just now' for a future timestamp", () => {
    const d = new Date(REF.getTime() + 2 * 60 * 1000);
    expect(describeParentRelativeTime(d.toISOString(), REF)).toBe("Just now");
  });

  it("says '1 minute ago' at exactly 60 seconds", () => {
    expect(describeParentRelativeTime(isoMinutesAgo(1), REF)).toBe("1 minute ago");
  });

  it("says 'N minutes ago' for 2-59 minutes", () => {
    expect(describeParentRelativeTime(isoMinutesAgo(2), REF)).toBe("2 minutes ago");
    expect(describeParentRelativeTime(isoMinutesAgo(59), REF)).toBe("59 minutes ago");
  });

  it("says '1 hour ago' at exactly 60 minutes", () => {
    expect(describeParentRelativeTime(isoMinutesAgo(60), REF)).toBe("1 hour ago");
  });

  it("says 'N hours ago' for 2-23 hours", () => {
    expect(describeParentRelativeTime(isoHoursAgo(2), REF)).toBe("2 hours ago");
    expect(describeParentRelativeTime(isoHoursAgo(23), REF)).toBe("23 hours ago");
  });

  it("says '1 day ago' at exactly 24 hours", () => {
    expect(describeParentRelativeTime(isoHoursAgo(24), REF)).toBe("1 day ago");
  });

  it("says 'N days ago' for 2-6 days", () => {
    expect(describeParentRelativeTime(isoDaysAgo(2), REF)).toBe("2 days ago");
    expect(describeParentRelativeTime(isoDaysAgo(6), REF)).toBe("6 days ago");
  });

  it("falls back to the locale string for 7+ days old", () => {
    const sevenDays = new Date(REF.getTime() - 7 * 24 * 60 * 60 * 1000);
    const expected = sevenDays.toLocaleString();
    expect(describeParentRelativeTime(sevenDays.toISOString(), REF)).toBe(expected);
  });

  it("falls back to the locale string for a year-old timestamp", () => {
    const old = new Date(REF.getTime() - 365 * 24 * 60 * 60 * 1000);
    const expected = old.toLocaleString();
    expect(describeParentRelativeTime(old.toISOString(), REF)).toBe(expected);
  });

  it("uses the system clock when now is omitted", () => {
    const result = describeParentRelativeTime(new Date().toISOString());
    expect(result).toBe("Just now");
  });

  it("returns the raw input for a non-string input", () => {
    expect(describeParentRelativeTime(null as unknown as string, REF)).toBe("");
  });

  it("preserves a very old timestamp verbatim when Date coerces to NaN edge", () => {
    expect(describeParentRelativeTime("   ", REF)).toBe("   ");
  });
});
