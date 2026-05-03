import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { computeDreamReadiness, describeDreamReadiness } from "./dreamReadiness";

function makeDream(requires: string[]): Dream {
  return {
    id: "d1",
    title_parent: "d1",
    title_kid: "d1",
    summary_kid: "d1",
    categories: ["arcade"],
    interest_tags: [],
    requires,
    style_hints: [],
    emoji: "✨",
    difficulty: 1,
  };
}

function makeKp(id: string): KnowledgePoint {
  return {
    id,
    title_parent: id,
    title_kid: id,
    area: "html",
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

function graphOf(nodes: KnowledgePoint[]): KnowledgeGraph {
  return {
    nodes,
    byId: Object.fromEntries(nodes.map((n) => [n.id, n])),
  };
}

function progressWith(mastered: string[]): Progress {
  const progress = emptyProgress();
  for (const id of mastered) {
    progress.knowledgePoints[id] = {
      status: "did_with_help",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
    };
  }
  return progress;
}

describe("computeDreamReadiness", () => {
  it("returns allReady for a dream with no required KPs", () => {
    const dream = makeDream([]);
    const graph = graphOf([]);
    expect(computeDreamReadiness(dream, graph, emptyProgress())).toEqual({
      requiredCount: 0,
      readyCount: 0,
      unknownCount: 0,
      allReady: true,
    });
  });

  it("returns zero readyCount when progress is null", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    expect(computeDreamReadiness(dream, graph, null)).toEqual({
      requiredCount: 2,
      readyCount: 0,
      unknownCount: 0,
      allReady: false,
    });
  });

  it("counts each required KP that meets did_with_help", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    const progress = progressWith(["a", "c"]);
    expect(computeDreamReadiness(dream, graph, progress)).toEqual({
      requiredCount: 3,
      readyCount: 2,
      unknownCount: 0,
      allReady: false,
    });
  });

  it("marks allReady when every required KP is met", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const progress = progressWith(["a", "b"]);
    expect(computeDreamReadiness(dream, graph, progress).allReady).toBe(true);
  });

  it("does not count KPs below did_with_help (saw_it is below)", () => {
    const dream = makeDream(["a"]);
    const graph = graphOf([makeKp("a")]);
    const progress = emptyProgress();
    progress.knowledgePoints.a = {
      status: "saw_it",
      firstSeenAt: "t",
      updatedAt: "t",
    };
    expect(computeDreamReadiness(dream, graph, progress).readyCount).toBe(0);
  });

  it("treats skipped KPs as ready via kpMeets", () => {
    const dream = makeDream(["a"]);
    const graph = graphOf([makeKp("a")]);
    const progress = emptyProgress();
    progress.knowledgePoints.a = {
      status: "saw_it",
      firstSeenAt: "t",
      updatedAt: "t",
      skipped: true,
    };
    expect(computeDreamReadiness(dream, graph, progress).readyCount).toBe(1);
  });

  it("surfaces unknown requires that are missing from the graph", () => {
    const dream = makeDream(["known", "missing"]);
    const graph = graphOf([makeKp("known")]);
    const progress = progressWith(["known"]);
    expect(computeDreamReadiness(dream, graph, progress)).toEqual({
      requiredCount: 2,
      readyCount: 1,
      unknownCount: 1,
      allReady: false,
    });
  });

  it("tolerates a null graph by counting KPs directly from progress", () => {
    const dream = makeDream(["a", "b"]);
    const progress = progressWith(["a"]);
    expect(computeDreamReadiness(dream, null, progress)).toEqual({
      requiredCount: 2,
      readyCount: 1,
      unknownCount: 0,
      allReady: false,
    });
  });
});

describe("describeDreamReadiness", () => {
  it("returns 'Ready to build!' when required is zero", () => {
    expect(
      describeDreamReadiness({
        requiredCount: 0,
        readyCount: 0,
        unknownCount: 0,
        allReady: true,
      }),
    ).toBe("Ready to build!");
  });

  it("returns 'Ready to build!' when all required KPs are ready", () => {
    expect(
      describeDreamReadiness({
        requiredCount: 3,
        readyCount: 3,
        unknownCount: 0,
        allReady: true,
      }),
    ).toBe("Ready to build!");
  });

  it("returns a 'Bit will teach N new skills' message when nothing is ready", () => {
    expect(
      describeDreamReadiness({
        requiredCount: 4,
        readyCount: 0,
        unknownCount: 0,
        allReady: false,
      }),
    ).toBe("Bit will teach 4 new skills");
  });

  it("uses singular skill copy when one skill is required", () => {
    expect(
      describeDreamReadiness({
        requiredCount: 1,
        readyCount: 0,
        unknownCount: 0,
        allReady: false,
      }),
    ).toBe("Bit will teach 1 new skill");
  });

  it("returns a 'You know X of Y skills' message for partial readiness", () => {
    expect(
      describeDreamReadiness({
        requiredCount: 5,
        readyCount: 2,
        unknownCount: 0,
        allReady: false,
      }),
    ).toBe("You know 2 of 5 skills");
  });
});
