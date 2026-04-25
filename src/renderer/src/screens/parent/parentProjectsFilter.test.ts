import { describe, expect, it } from "vitest";
import type { ParentProjectRow } from "./parentProjectRows";
import {
  countParentProjectsByStatusFilter,
  filterParentProjectsByStatus,
  PARENT_PROJECTS_STATUS_FILTER_LABELS,
  PARENT_PROJECTS_STATUS_FILTERS,
} from "./parentProjectsFilter";

function makeRow(overrides: Partial<ParentProjectRow> = {}): ParentProjectRow {
  return {
    slug: "snake",
    dreamId: "snake",
    title: "Snake",
    startedAt: "2026-04-20T12:00:00.000Z",
    lastActiveAt: "2026-04-20T12:00:00.000Z",
    isCurrent: false,
    isKnown: true,
    ...overrides,
  };
}

describe("PARENT_PROJECTS_STATUS_FILTERS", () => {
  it("exposes the three filter options in a stable order", () => {
    expect(PARENT_PROJECTS_STATUS_FILTERS).toEqual(["all", "active", "removed"]);
  });

  it("ships a label for each filter id", () => {
    for (const id of PARENT_PROJECTS_STATUS_FILTERS) {
      expect(typeof PARENT_PROJECTS_STATUS_FILTER_LABELS[id]).toBe("string");
      expect(PARENT_PROJECTS_STATUS_FILTER_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe("filterParentProjectsByStatus", () => {
  it("returns a new array (not the input reference) on 'all'", () => {
    const rows = [makeRow()];
    const out = filterParentProjectsByStatus(rows, "all");
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it("preserves order on 'all'", () => {
    const rows = [
      makeRow({ slug: "a" }),
      makeRow({ slug: "b", isKnown: false }),
      makeRow({ slug: "c" }),
    ];
    const out = filterParentProjectsByStatus(rows, "all");
    expect(out.map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  it("keeps only known dreams for 'active'", () => {
    const rows = [
      makeRow({ slug: "snake", isKnown: true }),
      makeRow({ slug: "gone", isKnown: false, dreamId: "gone" }),
    ];
    const out = filterParentProjectsByStatus(rows, "active");
    expect(out.map((r) => r.slug)).toEqual(["snake"]);
  });

  it("keeps only removed/orphan dreams for 'removed'", () => {
    const rows = [
      makeRow({ slug: "snake", isKnown: true }),
      makeRow({ slug: "gone", isKnown: false, dreamId: "gone" }),
      makeRow({ slug: "orphan", isKnown: false, dreamId: null }),
    ];
    const out = filterParentProjectsByStatus(rows, "removed");
    expect(out.map((r) => r.slug)).toEqual(["gone", "orphan"]);
  });

  it("classifies current projects as active when the dream is known", () => {
    const rows = [makeRow({ slug: "snake", isKnown: true, isCurrent: true })];
    expect(filterParentProjectsByStatus(rows, "active").map((r) => r.slug)).toEqual(["snake"]);
    expect(filterParentProjectsByStatus(rows, "removed")).toEqual([]);
  });

  it("tolerates an empty input at every filter", () => {
    for (const filter of PARENT_PROJECTS_STATUS_FILTERS) {
      expect(filterParentProjectsByStatus([], filter)).toEqual([]);
    }
  });

  it("returns an empty list when no rows match a specific filter", () => {
    const rows = [makeRow({ slug: "snake", isKnown: true })];
    expect(filterParentProjectsByStatus(rows, "removed")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ slug: "a", isKnown: true }), makeRow({ slug: "b", isKnown: false })];
    const snapshot = rows.map((r) => r.slug);
    filterParentProjectsByStatus(rows, "active");
    expect(rows.map((r) => r.slug)).toEqual(snapshot);
  });
});

describe("countParentProjectsByStatusFilter", () => {
  it("returns zeros for an empty input", () => {
    expect(countParentProjectsByStatusFilter([])).toEqual({ all: 0, active: 0, removed: 0 });
  });

  it("counts 'all' as the full row count regardless of status", () => {
    const rows = [
      makeRow({ slug: "a", isKnown: true }),
      makeRow({ slug: "b", isKnown: false }),
      makeRow({ slug: "c", isKnown: true }),
    ];
    expect(countParentProjectsByStatusFilter(rows).all).toBe(3);
  });

  it("counts active and removed separately", () => {
    const rows = [
      makeRow({ slug: "a", isKnown: true }),
      makeRow({ slug: "b", isKnown: false }),
      makeRow({ slug: "c", isKnown: true }),
      makeRow({ slug: "d", isKnown: false, dreamId: null }),
    ];
    const counts = countParentProjectsByStatusFilter(rows);
    expect(counts.active).toBe(2);
    expect(counts.removed).toBe(2);
    expect(counts.all).toBe(4);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ slug: "a", isKnown: true }), makeRow({ slug: "b", isKnown: false })];
    const snapshot = rows.map((r) => r.slug);
    countParentProjectsByStatusFilter(rows);
    expect(rows.map((r) => r.slug)).toEqual(snapshot);
  });
});
