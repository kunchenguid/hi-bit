import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { emptyProgress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { describeKpPrereqs } from "./kpPrereqs";

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

describe("describeKpPrereqs", () => {
  it("returns null when kp is null", () => {
    expect(describeKpPrereqs(null, null, null)).toBeNull();
  });

  it("returns null when kp is undefined", () => {
    expect(describeKpPrereqs(undefined, null, null)).toBeNull();
  });

  it("returns null when prereqs is empty", () => {
    expect(describeKpPrereqs(makeKp({ prereqs: [] }), null, null)).toBeNull();
  });

  it("returns null when prereqs contains only empty strings", () => {
    expect(describeKpPrereqs(makeKp({ prereqs: ["", "   "] }), null, null)).toBeNull();
  });

  it("returns null when prereqs is not an array", () => {
    const kp = makeKp();
    (kp as unknown as { prereqs: unknown }).prereqs = "not-an-array";
    expect(describeKpPrereqs(kp, null, null)).toBeNull();
  });

  it("falls back to the prereq id as the title when the graph is missing", () => {
    const kp = makeKp({ prereqs: ["missing-kp"] });
    expect(describeKpPrereqs(kp, null, null)).toEqual([
      { id: "missing-kp", title: "missing-kp", state: "notStarted", known: false },
    ]);
  });

  it("uses the prereq's title_parent from the graph when available", () => {
    const prereq = makeKp({ id: "html-doc-shell", title_parent: "HTML Document Shell" });
    const kp = makeKp({ prereqs: ["html-doc-shell"] });
    const graph = makeGraph([prereq]);
    expect(describeKpPrereqs(kp, graph, null)).toEqual([
      { id: "html-doc-shell", title: "HTML Document Shell", state: "notStarted", known: true },
    ]);
  });

  it("classifies saw_it as inProgress", () => {
    const prereq = makeKp({ id: "p1", title_parent: "P One" });
    const kp = makeKp({ prereqs: ["p1"] });
    const graph = makeGraph([prereq]);
    const progress = makeProgress({
      knowledgePoints: { p1: { status: "saw_it", firstSeenAt: "t", updatedAt: "t" } },
    });
    expect(describeKpPrereqs(kp, graph, progress)).toEqual([
      { id: "p1", title: "P One", state: "inProgress", known: true },
    ]);
  });

  it("classifies did_with_help / did_unprompted / explained_it as mastered", () => {
    const prereq1 = makeKp({ id: "p1", title_parent: "P1" });
    const prereq2 = makeKp({ id: "p2", title_parent: "P2" });
    const prereq3 = makeKp({ id: "p3", title_parent: "P3" });
    const kp = makeKp({ prereqs: ["p1", "p2", "p3"] });
    const graph = makeGraph([prereq1, prereq2, prereq3]);
    const progress = makeProgress({
      knowledgePoints: {
        p1: { status: "did_with_help", firstSeenAt: "t", updatedAt: "t" },
        p2: { status: "did_unprompted", firstSeenAt: "t", updatedAt: "t" },
        p3: { status: "explained_it", firstSeenAt: "t", updatedAt: "t" },
      },
    });
    const out = describeKpPrereqs(kp, graph, progress);
    expect(out?.map((c) => c.state)).toEqual(["mastered", "mastered", "mastered"]);
  });

  it("classifies a skipped prereq as mastered even without a status", () => {
    const prereq = makeKp({ id: "p1", title_parent: "P1" });
    const kp = makeKp({ prereqs: ["p1"] });
    const graph = makeGraph([prereq]);
    const progress = makeProgress({
      knowledgePoints: {
        p1: { status: "saw_it", firstSeenAt: "t", updatedAt: "t", skipped: true },
      },
    });
    expect(describeKpPrereqs(kp, graph, progress)?.[0]?.state).toBe("mastered");
  });

  it("preserves author order across multiple prereqs", () => {
    const kp = makeKp({ prereqs: ["third", "first", "second"] });
    const out = describeKpPrereqs(kp, null, null);
    expect(out?.map((c) => c.id)).toEqual(["third", "first", "second"]);
  });

  it("deduplicates repeated prereqs, preserving first-seen order", () => {
    const kp = makeKp({ prereqs: ["a", "b", "a", "c"] });
    const out = describeKpPrereqs(kp, null, null);
    expect(out?.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("trims surrounding whitespace from each prereq id", () => {
    const kp = makeKp({ prereqs: ["  html-doc-shell  ", "\tevents-click\n"] });
    const out = describeKpPrereqs(kp, null, null);
    expect(out?.map((c) => c.id)).toEqual(["html-doc-shell", "events-click"]);
  });

  it("skips non-string entries in the prereqs array", () => {
    const kp = makeKp();
    (kp as unknown as { prereqs: unknown[] }).prereqs = ["valid", 42, null, "also-valid"];
    const out = describeKpPrereqs(kp, null, null);
    expect(out?.map((c) => c.id)).toEqual(["valid", "also-valid"]);
  });

  it("marks prereqs not present in the graph as known=false", () => {
    const prereq = makeKp({ id: "known", title_parent: "Known" });
    const kp = makeKp({ prereqs: ["known", "orphan"] });
    const graph = makeGraph([prereq]);
    const out = describeKpPrereqs(kp, graph, null);
    expect(out).toEqual([
      { id: "known", title: "Known", state: "notStarted", known: true },
      { id: "orphan", title: "orphan", state: "notStarted", known: false },
    ]);
  });

  it("does not mutate the input KP's prereqs array", () => {
    const prereqs = ["a", "", "a", "b"];
    const kp = makeKp({ prereqs });
    describeKpPrereqs(kp, null, null);
    expect(prereqs).toEqual(["a", "", "a", "b"]);
  });
});
