import { describe, expect, it } from "vitest";
import type { RecentSessionsOverviewEntry } from "./recentSessionsSummary";
import { describeSessionStarted } from "./sessionStarted";

function makeRow(
  overrides: Partial<RecentSessionsOverviewEntry> = {},
): RecentSessionsOverviewEntry {
  return {
    sessionId: "sess-abc",
    role: "kid",
    harness: "claude",
    firstAt: "2026-04-23T09:30:00.000Z",
    lastAt: "2026-04-23T09:55:00.000Z",
    turnCount: 3,
    totalDurationMs: 12000,
    ...overrides,
  };
}

describe("describeSessionStarted", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");

  it("returns null when row is null", () => {
    expect(describeSessionStarted(null, { now })).toBeNull();
  });

  it("returns null when row is undefined", () => {
    expect(describeSessionStarted(undefined, { now })).toBeNull();
  });

  it("returns null when firstAt is empty", () => {
    const row = makeRow({ firstAt: "" });
    expect(describeSessionStarted(row, { now })).toBeNull();
  });

  it("returns null when firstAt is not a parseable date", () => {
    const row = makeRow({ firstAt: "not-a-date" });
    expect(describeSessionStarted(row, { now })).toBeNull();
  });

  it("returns null when firstAt equals lastAt (single-turn session, no span)", () => {
    const row = makeRow({
      firstAt: "2026-04-23T09:55:00.000Z",
      lastAt: "2026-04-23T09:55:00.000Z",
    });
    expect(describeSessionStarted(row, { now })).toBeNull();
  });

  it("returns minutes-ago phrasing when session started minutes before now", () => {
    const row = makeRow({
      firstAt: "2026-04-23T09:30:00.000Z",
      lastAt: "2026-04-23T09:55:00.000Z",
    });
    expect(describeSessionStarted(row, { now })).toEqual({
      startedAt: "2026-04-23T09:30:00.000Z",
      relative: "30 minutes ago",
    });
  });

  it("returns hours-ago phrasing when the session started a few hours before", () => {
    const row = makeRow({
      firstAt: "2026-04-23T07:00:00.000Z",
      lastAt: "2026-04-23T09:50:00.000Z",
    });
    expect(describeSessionStarted(row, { now })).toEqual({
      startedAt: "2026-04-23T07:00:00.000Z",
      relative: "3 hours ago",
    });
  });

  it("returns days-ago phrasing when the session started days before", () => {
    const row = makeRow({
      firstAt: "2026-04-20T10:00:00.000Z",
      lastAt: "2026-04-20T11:00:00.000Z",
    });
    expect(describeSessionStarted(row, { now })).toEqual({
      startedAt: "2026-04-20T10:00:00.000Z",
      relative: "3 days ago",
    });
  });

  it("works independently of role (parent vs kid)", () => {
    const row = makeRow({
      role: "parent",
      firstAt: "2026-04-22T10:00:00.000Z",
      lastAt: "2026-04-22T12:00:00.000Z",
    });
    expect(describeSessionStarted(row, { now })).toEqual({
      startedAt: "2026-04-22T10:00:00.000Z",
      relative: "1 day ago",
    });
  });
});
