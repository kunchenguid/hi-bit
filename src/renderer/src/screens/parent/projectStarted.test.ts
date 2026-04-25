import { describe, expect, it } from "vitest";
import type { ParentProjectRow } from "./parentProjectRows";
import { describeProjectStarted } from "./projectStarted";

function makeRow(overrides: Partial<ParentProjectRow> = {}): ParentProjectRow {
  return {
    slug: "snake",
    dreamId: "snake",
    title: "Snake",
    startedAt: "2026-04-20T10:00:00.000Z",
    lastActiveAt: "2026-04-23T09:55:00.000Z",
    isCurrent: false,
    isKnown: true,
    ...overrides,
  };
}

describe("describeProjectStarted", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");

  it("returns null when row is null", () => {
    expect(describeProjectStarted(null, { now })).toBeNull();
  });

  it("returns null when row is undefined", () => {
    expect(describeProjectStarted(undefined, { now })).toBeNull();
  });

  it("returns null when startedAt is null", () => {
    const row = makeRow({ startedAt: null });
    expect(describeProjectStarted(row, { now })).toBeNull();
  });

  it("returns null when startedAt is empty", () => {
    const row = makeRow({ startedAt: "" });
    expect(describeProjectStarted(row, { now })).toBeNull();
  });

  it("returns null when startedAt is not a parseable date", () => {
    const row = makeRow({ startedAt: "not-a-date" });
    expect(describeProjectStarted(row, { now })).toBeNull();
  });

  it("returns null when startedAt equals lastActiveAt (just-started, no further activity)", () => {
    const row = makeRow({
      startedAt: "2026-04-23T09:55:00.000Z",
      lastActiveAt: "2026-04-23T09:55:00.000Z",
    });
    expect(describeProjectStarted(row, { now })).toBeNull();
  });

  it("returns null when lastActiveAt is null but startedAt equals the coalesced empty (distinct -> still shown)", () => {
    const row = makeRow({
      startedAt: "2026-04-22T10:00:00.000Z",
      lastActiveAt: null,
    });
    expect(describeProjectStarted(row, { now })).toEqual({
      startedAt: "2026-04-22T10:00:00.000Z",
      relative: "1 day ago",
    });
  });

  it("returns days-ago phrasing when the project was started a few days before", () => {
    const row = makeRow({
      startedAt: "2026-04-20T10:00:00.000Z",
      lastActiveAt: "2026-04-23T09:55:00.000Z",
    });
    expect(describeProjectStarted(row, { now })).toEqual({
      startedAt: "2026-04-20T10:00:00.000Z",
      relative: "3 days ago",
    });
  });

  it("returns minutes-ago phrasing for very recent starts (but distinct from lastActive)", () => {
    const row = makeRow({
      startedAt: "2026-04-23T09:45:00.000Z",
      lastActiveAt: "2026-04-23T09:55:00.000Z",
    });
    expect(describeProjectStarted(row, { now })).toEqual({
      startedAt: "2026-04-23T09:45:00.000Z",
      relative: "15 minutes ago",
    });
  });

  it("works independently of isCurrent / isKnown flags", () => {
    const row = makeRow({
      startedAt: "2026-04-21T10:00:00.000Z",
      lastActiveAt: "2026-04-23T09:30:00.000Z",
      isCurrent: true,
      isKnown: false,
    });
    expect(describeProjectStarted(row, { now })).toEqual({
      startedAt: "2026-04-21T10:00:00.000Z",
      relative: "2 days ago",
    });
  });
});
