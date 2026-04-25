import type { Dream, DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { emptyProgress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import type { DreamHistoryEntry } from "./dreamHistoryList";
import { describeDreamHistoryRequires } from "./dreamHistoryRequires";

function makeDream(id: string, overrides: Partial<Dream> = {}): Dream {
  return {
    id,
    title_parent: overrides.title_parent ?? id,
    title_kid: overrides.title_kid ?? id,
    summary_kid: overrides.summary_kid ?? "A fun project",
    categories: overrides.categories ?? ["arcade"],
    interest_tags: overrides.interest_tags ?? [],
    requires: overrides.requires ?? [],
    style_hints: overrides.style_hints ?? [],
    emoji: overrides.emoji ?? "✨",
  };
}

function makeLibrary(...dreams: Dream[]): DreamLibrary {
  const byId: Record<string, Dream> = {};
  for (const d of dreams) byId[d.id] = d;
  return { dreams, byId };
}

function makeKp(overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id: overrides.id ?? "kp-a",
    title_parent: overrides.title_parent ?? "KP A",
    title_kid: overrides.title_kid ?? "kp a kid",
    area: overrides.area ?? "html",
    prereqs: overrides.prereqs ?? [],
    introduces: overrides.introduces ?? [],
    mastery_signals: overrides.mastery_signals ?? {
      saw_it: "saw",
      did_with_help: "helped",
      did_unprompted: "solo",
      explained_it: "explained",
    },
  };
}

function makeGraph(nodes: KnowledgePoint[]): KnowledgeGraph {
  const byId: Record<string, KnowledgePoint> = {};
  for (const n of nodes) byId[n.id] = n;
  return { nodes, byId };
}

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return { ...emptyProgress(), ...overrides };
}

function makeEntry(overrides: Partial<DreamHistoryEntry> = {}): DreamHistoryEntry {
  return {
    dreamId: overrides.dreamId ?? "snake",
    title: overrides.title ?? "Snake",
    categories: overrides.categories ?? ["arcade"],
    isCurrent: overrides.isCurrent ?? false,
    isKnown: overrides.isKnown ?? true,
  };
}

describe("describeDreamHistoryRequires", () => {
  it("returns null when entry is null", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["kp-a"] }));
    expect(describeDreamHistoryRequires(null, library, null, null)).toBeNull();
  });

  it("returns null when entry is undefined", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["kp-a"] }));
    expect(describeDreamHistoryRequires(undefined, library, null, null)).toBeNull();
  });

  it("returns null when the library is null", () => {
    expect(describeDreamHistoryRequires(makeEntry(), null, null, null)).toBeNull();
  });

  it("returns null when the dream is not in the library (orphaned)", () => {
    const library = makeLibrary(makeDream("pet-page", { requires: ["kp-a"] }));
    expect(
      describeDreamHistoryRequires(makeEntry({ dreamId: "snake" }), library, null, null),
    ).toBeNull();
  });

  it("returns null when requires is empty", () => {
    const library = makeLibrary(makeDream("snake", { requires: [] }));
    expect(describeDreamHistoryRequires(makeEntry(), library, null, null)).toBeNull();
  });

  it("returns null when requires contains only whitespace entries", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["", "   ", "\t\n"] }));
    expect(describeDreamHistoryRequires(makeEntry(), library, null, null)).toBeNull();
  });

  it("falls back to the kp id as the title when the graph is missing", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["missing-kp"] }));
    expect(describeDreamHistoryRequires(makeEntry(), library, null, null)).toEqual([
      { id: "missing-kp", title: "missing-kp", state: "notStarted", known: false },
    ]);
  });

  it("uses the kp's title_parent from the graph when available", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["html-doc-shell"] }));
    const graph = makeGraph([
      makeKp({ id: "html-doc-shell", title_parent: "HTML Document Shell" }),
    ]);
    expect(describeDreamHistoryRequires(makeEntry(), library, graph, null)).toEqual([
      { id: "html-doc-shell", title: "HTML Document Shell", state: "notStarted", known: true },
    ]);
  });

  it("classifies saw_it as inProgress", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["p1"] }));
    const graph = makeGraph([makeKp({ id: "p1", title_parent: "P One" })]);
    const progress = makeProgress({
      knowledgePoints: { p1: { status: "saw_it", firstSeenAt: "t", updatedAt: "t" } },
    });
    expect(describeDreamHistoryRequires(makeEntry(), library, graph, progress)).toEqual([
      { id: "p1", title: "P One", state: "inProgress", known: true },
    ]);
  });

  it("classifies did_with_help / did_unprompted / explained_it as mastered", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["p1", "p2", "p3"] }));
    const graph = makeGraph([
      makeKp({ id: "p1", title_parent: "P1" }),
      makeKp({ id: "p2", title_parent: "P2" }),
      makeKp({ id: "p3", title_parent: "P3" }),
    ]);
    const progress = makeProgress({
      knowledgePoints: {
        p1: { status: "did_with_help", firstSeenAt: "t", updatedAt: "t" },
        p2: { status: "did_unprompted", firstSeenAt: "t", updatedAt: "t" },
        p3: { status: "explained_it", firstSeenAt: "t", updatedAt: "t" },
      },
    });
    const out = describeDreamHistoryRequires(makeEntry(), library, graph, progress);
    expect(out?.map((c) => c.state)).toEqual(["mastered", "mastered", "mastered"]);
  });

  it("classifies a skipped require as mastered even without a status", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["p1"] }));
    const graph = makeGraph([makeKp({ id: "p1", title_parent: "P1" })]);
    const progress = makeProgress({
      knowledgePoints: {
        p1: { status: "saw_it", firstSeenAt: "t", updatedAt: "t", skipped: true },
      },
    });
    expect(describeDreamHistoryRequires(makeEntry(), library, graph, progress)?.[0]?.state).toBe(
      "mastered",
    );
  });

  it("preserves author order across multiple requires", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["third", "first", "second"] }));
    const out = describeDreamHistoryRequires(makeEntry(), library, null, null);
    expect(out?.map((c) => c.id)).toEqual(["third", "first", "second"]);
  });

  it("deduplicates repeated requires, preserving first-seen order", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["a", "b", "a", "c"] }));
    const out = describeDreamHistoryRequires(makeEntry(), library, null, null);
    expect(out?.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("trims surrounding whitespace from each require id", () => {
    const library = makeLibrary(
      makeDream("snake", { requires: ["  html-doc-shell  ", "\tevents-click\n"] }),
    );
    const out = describeDreamHistoryRequires(makeEntry(), library, null, null);
    expect(out?.map((c) => c.id)).toEqual(["html-doc-shell", "events-click"]);
  });

  it("skips non-string entries in the requires array", () => {
    const dream = makeDream("snake");
    (dream as unknown as { requires: unknown[] }).requires = ["valid", 42, null, "also-valid"];
    const library = makeLibrary(dream);
    const out = describeDreamHistoryRequires(makeEntry(), library, null, null);
    expect(out?.map((c) => c.id)).toEqual(["valid", "also-valid"]);
  });

  it("marks requires not present in the graph as known=false", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["known", "orphan"] }));
    const graph = makeGraph([makeKp({ id: "known", title_parent: "Known" })]);
    const out = describeDreamHistoryRequires(makeEntry(), library, graph, null);
    expect(out).toEqual([
      { id: "known", title: "Known", state: "notStarted", known: true },
      { id: "orphan", title: "orphan", state: "notStarted", known: false },
    ]);
  });

  it("does not mutate the input dream's requires array", () => {
    const requires = ["a", "", "a", "b"];
    const library = makeLibrary(makeDream("snake", { requires }));
    describeDreamHistoryRequires(makeEntry(), library, null, null);
    expect(requires).toEqual(["a", "", "a", "b"]);
  });

  it("works independently of isCurrent / isKnown flags", () => {
    const library = makeLibrary(makeDream("snake", { requires: ["p1"] }));
    const graph = makeGraph([makeKp({ id: "p1", title_parent: "P1" })]);
    const entry = makeEntry({ isCurrent: true, isKnown: true });
    expect(describeDreamHistoryRequires(entry, library, graph, null)).toEqual([
      { id: "p1", title: "P1", state: "notStarted", known: true },
    ]);
  });
});
