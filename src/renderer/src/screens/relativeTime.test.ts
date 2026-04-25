import { describe, expect, it } from "vitest";
import { describeKidRelativeTime } from "./relativeTime";

const REF = new Date("2026-04-23T15:00:00.000Z");

function iso(daysAgo: number, hours = 0): string {
  const d = new Date(REF);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(d.getUTCHours() - hours);
  return d.toISOString();
}

describe("describeKidRelativeTime", () => {
  it("returns null for empty string", () => {
    expect(describeKidRelativeTime("", REF)).toBeNull();
  });

  it("returns null for invalid timestamp", () => {
    expect(describeKidRelativeTime("not-a-date", REF)).toBeNull();
  });

  it("says 'today' for same calendar day", () => {
    expect(describeKidRelativeTime(iso(0, 1), REF)).toBe("today");
  });

  it("says 'today' even for hours-old timestamp on same day", () => {
    expect(describeKidRelativeTime(iso(0, 5), REF)).toBe("today");
  });

  it("says 'yesterday' for one calendar day ago", () => {
    expect(describeKidRelativeTime(iso(1), REF)).toBe("yesterday");
  });

  it("says 'N days ago' for 2-6 days", () => {
    expect(describeKidRelativeTime(iso(2), REF)).toBe("2 days ago");
    expect(describeKidRelativeTime(iso(6), REF)).toBe("6 days ago");
  });

  it("says 'last week' at 7-13 days", () => {
    expect(describeKidRelativeTime(iso(7), REF)).toBe("last week");
    expect(describeKidRelativeTime(iso(13), REF)).toBe("last week");
  });

  it("says 'N weeks ago' at 14-29 days", () => {
    expect(describeKidRelativeTime(iso(14), REF)).toBe("2 weeks ago");
    expect(describeKidRelativeTime(iso(21), REF)).toBe("3 weeks ago");
    expect(describeKidRelativeTime(iso(29), REF)).toBe("4 weeks ago");
  });

  it("says 'a while back' at 30+ days", () => {
    expect(describeKidRelativeTime(iso(30), REF)).toBe("a while back");
    expect(describeKidRelativeTime(iso(365), REF)).toBe("a while back");
  });

  it("says 'today' for a future timestamp same day", () => {
    const future = new Date(REF);
    future.setUTCHours(future.getUTCHours() + 2);
    expect(describeKidRelativeTime(future.toISOString(), REF)).toBe("today");
  });

  it("clamps a future timestamp on a later day to 'today'", () => {
    const future = new Date(REF);
    future.setUTCDate(future.getUTCDate() + 3);
    expect(describeKidRelativeTime(future.toISOString(), REF)).toBe("today");
  });

  it("uses the system clock when now is omitted", () => {
    const result = describeKidRelativeTime(new Date().toISOString());
    expect(result).toBe("today");
  });
});
