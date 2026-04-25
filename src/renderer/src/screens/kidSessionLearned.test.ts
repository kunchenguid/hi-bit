import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { buildKidSessionLearned, computeDoneKpIds } from "./kidSessionLearned";

function makeKp(id: string, titleKid?: string): KnowledgePoint {
  return {
    id,
    title_parent: id,
    title_kid: titleKid ?? id,
    area: "html",
    prereqs: [],
    introduces: [],
    mastery_signals: { saw_it: "s", did_with_help: "d", did_unprompted: "u", explained_it: "e" },
  };
}

function graphOf(nodes: KnowledgePoint[]): KnowledgeGraph {
  return { nodes, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

function progressWith(done: string[]): Progress {
  const progress = emptyProgress();
  for (const id of done) {
    progress.knowledgePoints[id] = {
      status: "did_with_help",
      firstSeenAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    };
  }
  return progress;
}

describe("computeDoneKpIds", () => {
  it("returns empty set when graph or progress is null", () => {
    expect(computeDoneKpIds(null, emptyProgress()).size).toBe(0);
    expect(computeDoneKpIds(graphOf([makeKp("a")]), null).size).toBe(0);
  });

  it("includes KPs meeting did_with_help threshold", () => {
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    const done = computeDoneKpIds(graph, progressWith(["a", "c"]));
    expect([...done].sort()).toEqual(["a", "c"]);
  });

  it("excludes saw_it-only KPs (below threshold)", () => {
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const progress = emptyProgress();
    progress.knowledgePoints.a = {
      status: "saw_it",
      firstSeenAt: "t",
      updatedAt: "t",
    };
    expect(computeDoneKpIds(graph, progress).size).toBe(0);
  });

  it("excludes skipped KPs even when they meet threshold", () => {
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const progress = progressWith(["a", "b"]);
    progress.knowledgePoints.a = { ...progress.knowledgePoints.a, skipped: true };
    expect([...computeDoneKpIds(graph, progress)]).toEqual(["b"]);
  });
});

describe("buildKidSessionLearned", () => {
  it("returns null when graph is null", () => {
    expect(buildKidSessionLearned(null, emptyProgress(), new Set())).toBeNull();
  });

  it("returns null when progress is null", () => {
    const graph = graphOf([makeKp("a")]);
    expect(buildKidSessionLearned(graph, null, new Set())).toBeNull();
  });

  it("returns null when sessionStartDoneKpIds is null (snapshot not captured yet)", () => {
    const graph = graphOf([makeKp("a")]);
    expect(buildKidSessionLearned(graph, progressWith(["a"]), null)).toBeNull();
  });

  it("returns null when no new KPs have been learned this session", () => {
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const progress = progressWith(["a", "b"]);
    const snapshot = new Set(["a", "b"]);
    expect(buildKidSessionLearned(graph, progress, snapshot)).toBeNull();
  });

  it("renders 1 newly-learned KP with singular 'skill'", () => {
    const graph = graphOf([makeKp("a", "the frame")]);
    const progress = progressWith(["a"]);
    const snapshot = new Set<string>();
    const result = buildKidSessionLearned(graph, progress, snapshot);
    expect(result?.count).toBe(1);
    expect(result?.items).toEqual([{ id: "a", titleKid: "the frame" }]);
    expect(result?.text).toBe("You just learned 1 new skill: the frame.");
  });

  it("renders 2 newly-learned KPs with 'X and Y' conjunction", () => {
    const graph = graphOf([makeKp("a", "the frame"), makeKp("b", "a big heading")]);
    const progress = progressWith(["a", "b"]);
    const snapshot = new Set<string>();
    const result = buildKidSessionLearned(graph, progress, snapshot);
    expect(result?.count).toBe(2);
    expect(result?.text).toBe("You just learned 2 new skills: the frame and a big heading.");
  });

  it("renders 3+ newly-learned KPs with Oxford comma", () => {
    const graph = graphOf([
      makeKp("a", "the frame"),
      makeKp("b", "a big heading"),
      makeKp("c", "a paragraph"),
    ]);
    const progress = progressWith(["a", "b", "c"]);
    const snapshot = new Set<string>();
    const result = buildKidSessionLearned(graph, progress, snapshot);
    expect(result?.count).toBe(3);
    expect(result?.text).toBe(
      "You just learned 3 new skills: the frame, a big heading, and a paragraph.",
    );
  });

  it("only includes KPs that became done after the snapshot", () => {
    const graph = graphOf([makeKp("a", "old skill"), makeKp("b", "new skill")]);
    const progress = progressWith(["a", "b"]);
    const snapshot = new Set(["a"]);
    const result = buildKidSessionLearned(graph, progress, snapshot);
    expect(result?.count).toBe(1);
    expect(result?.items).toEqual([{ id: "b", titleKid: "new skill" }]);
  });

  it("does not count saw_it-only KPs as newly learned", () => {
    const graph = graphOf([makeKp("a", "saw-only")]);
    const progress = emptyProgress();
    progress.knowledgePoints.a = { status: "saw_it", firstSeenAt: "t", updatedAt: "t" };
    expect(buildKidSessionLearned(graph, progress, new Set())).toBeNull();
  });

  it("does not count skipped KPs as newly learned", () => {
    const graph = graphOf([makeKp("a", "skip-me")]);
    const progress = progressWith(["a"]);
    progress.knowledgePoints.a = { ...progress.knowledgePoints.a, skipped: true };
    expect(buildKidSessionLearned(graph, progress, new Set())).toBeNull();
  });

  it("preserves graph-node order when listing titles", () => {
    const graph = graphOf([makeKp("a", "alpha"), makeKp("b", "bravo"), makeKp("c", "charlie")]);
    const progress = progressWith(["c", "a", "b"]);
    const snapshot = new Set<string>();
    const result = buildKidSessionLearned(graph, progress, snapshot);
    expect(result?.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
