import type { KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import {
  countMasteryFilterMatches,
  filterKpsByMasteryStatus,
  MASTERY_FILTERS,
} from "./masteryFilter";
import type { MasterySummary } from "./masterySummary";

function kp(id: string, area: KnowledgePoint["area"] = "html"): KnowledgePoint {
  return {
    id,
    title_parent: id,
    title_kid: id,
    area,
    prereqs: [],
    introduces: [],
    mastery_signals: {
      saw_it: "",
      did_with_help: "",
      did_unprompted: "",
      explained_it: "",
    },
  };
}

function progressWith(
  overrides: Record<
    string,
    { status?: Progress["knowledgePoints"][string]["status"]; skipped?: boolean }
  >,
): Progress {
  const p = emptyProgress();
  const now = "2026-04-23T00:00:00.000Z";
  for (const [id, over] of Object.entries(overrides)) {
    p.knowledgePoints[id] = {
      status: over.status ?? "saw_it",
      firstSeenAt: now,
      updatedAt: now,
      ...(over.skipped !== undefined ? { skipped: over.skipped } : {}),
    };
  }
  return p;
}

describe("MASTERY_FILTERS", () => {
  it("exposes all five filter ids in order", () => {
    expect(MASTERY_FILTERS).toEqual(["all", "mastered", "inProgress", "notStarted", "skipped"]);
  });
});

describe("filterKpsByMasteryStatus", () => {
  const nodes = [kp("a"), kp("b"), kp("c"), kp("d"), kp("e")];

  it("returns a new array on 'all' pass-through (not the same reference)", () => {
    const result = filterKpsByMasteryStatus(nodes, null, "all");
    expect(result).toEqual(nodes);
    expect(result).not.toBe(nodes);
  });

  it("preserves input order on 'all'", () => {
    expect(filterKpsByMasteryStatus(nodes, null, "all").map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("treats all KPs as notStarted when progress is null", () => {
    expect(filterKpsByMasteryStatus(nodes, null, "notStarted").map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(filterKpsByMasteryStatus(nodes, null, "mastered")).toEqual([]);
    expect(filterKpsByMasteryStatus(nodes, null, "inProgress")).toEqual([]);
    expect(filterKpsByMasteryStatus(nodes, null, "skipped")).toEqual([]);
  });

  it("filters to mastered (did_with_help threshold)", () => {
    const progress = progressWith({
      a: { status: "did_with_help" },
      b: { status: "did_unprompted" },
      c: { status: "explained_it" },
      d: { status: "saw_it" },
    });
    expect(filterKpsByMasteryStatus(nodes, progress, "mastered").map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters to inProgress (saw_it only)", () => {
    const progress = progressWith({
      a: { status: "saw_it" },
      b: { status: "did_with_help" },
      c: { status: "saw_it" },
    });
    expect(filterKpsByMasteryStatus(nodes, progress, "inProgress").map((n) => n.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("filters to notStarted (no entry)", () => {
    const progress = progressWith({
      a: { status: "saw_it" },
      b: { status: "did_with_help" },
    });
    expect(filterKpsByMasteryStatus(nodes, progress, "notStarted").map((n) => n.id)).toEqual([
      "c",
      "d",
      "e",
    ]);
  });

  it("filters to skipped (skipped flag wins over status)", () => {
    const progress = progressWith({
      a: { status: "did_unprompted", skipped: true },
      b: { status: "saw_it" },
      c: { skipped: true },
    });
    expect(filterKpsByMasteryStatus(nodes, progress, "skipped").map((n) => n.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterKpsByMasteryStatus(nodes, progress, "mastered")).toEqual([]);
  });

  it("returns an empty array for an empty input list", () => {
    expect(filterKpsByMasteryStatus([], null, "all")).toEqual([]);
    expect(
      filterKpsByMasteryStatus([], progressWith({ a: { status: "saw_it" } }), "inProgress"),
    ).toEqual([]);
  });

  it("does not mutate the input nodes array", () => {
    const input = [kp("a"), kp("b")];
    const before = input.slice();
    filterKpsByMasteryStatus(input, null, "all");
    expect(input).toEqual(before);
  });
});

describe("countMasteryFilterMatches", () => {
  function summary(over: Partial<MasterySummary>): MasterySummary {
    return {
      areas: [],
      total: 0,
      mastered: 0,
      inProgress: 0,
      notStarted: 0,
      skipped: 0,
      ...over,
    };
  }

  it("returns counts for all five filter ids", () => {
    const counts = countMasteryFilterMatches(summary({}));
    expect(Object.keys(counts).sort()).toEqual(
      ["all", "inProgress", "mastered", "notStarted", "skipped"].sort(),
    );
  });

  it("maps 'all' to summary.total", () => {
    const counts = countMasteryFilterMatches(summary({ total: 42 }));
    expect(counts.all).toBe(42);
  });

  it("maps each category to its matching summary field", () => {
    const counts = countMasteryFilterMatches(
      summary({ total: 10, mastered: 3, inProgress: 4, notStarted: 2, skipped: 1 }),
    );
    expect(counts.mastered).toBe(3);
    expect(counts.inProgress).toBe(4);
    expect(counts.notStarted).toBe(2);
    expect(counts.skipped).toBe(1);
  });

  it("returns all zeros for an empty summary", () => {
    const counts = countMasteryFilterMatches(summary({}));
    expect(counts).toEqual({
      all: 0,
      mastered: 0,
      inProgress: 0,
      notStarted: 0,
      skipped: 0,
    });
  });

  it("handles a zero 'all' with non-zero categories (invariant-safe)", () => {
    const counts = countMasteryFilterMatches(summary({ total: 0, mastered: 5 }));
    expect(counts.all).toBe(0);
    expect(counts.mastered).toBe(5);
  });
});
