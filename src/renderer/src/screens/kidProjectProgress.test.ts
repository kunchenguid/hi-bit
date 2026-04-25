import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { describeKidProjectProgress } from "./kidProjectProgress";

function makeDream(requires: string[]): Dream {
  return {
    id: "d1",
    title_parent: "Test Dream",
    title_kid: "test dream",
    summary_kid: "test",
    categories: ["arcade"],
    interest_tags: [],
    requires,
    style_hints: [],
    emoji: "✨",
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
    mastery_signals: { saw_it: "s", did_with_help: "d", did_unprompted: "u", explained_it: "e" },
  };
}

function graphOf(nodes: KnowledgePoint[]): KnowledgeGraph {
  return { nodes, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
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

describe("describeKidProjectProgress", () => {
  it("returns null when dream is null", () => {
    expect(describeKidProjectProgress(null, graphOf([]), emptyProgress())).toBeNull();
  });

  it("returns null for a dream with zero required KPs", () => {
    const dream = makeDream([]);
    expect(describeKidProjectProgress(dream, graphOf([]), emptyProgress())).toBeNull();
  });

  it("returns null when progress is null", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    expect(describeKidProjectProgress(dream, graph, null)).toBeNull();
  });

  it("returns null when readyCount is 0 (nothing motivating to show yet)", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    expect(describeKidProjectProgress(dream, graph, emptyProgress())).toBeNull();
  });

  it("returns a 'ready to finish!' pill when all required KPs are ready", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    expect(describeKidProjectProgress(dream, graph, progressWith(["a", "b"]))).toEqual({
      kicker: "skills",
      text: "ready to finish!",
      allReady: true,
    });
  });

  it("returns a 'X of Y ready' pill for partial readiness", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    expect(describeKidProjectProgress(dream, graph, progressWith(["a"]))).toEqual({
      kicker: "skills",
      text: "1 of 3 ready",
      allReady: false,
    });
  });

  it("counts multiple ready skills correctly", () => {
    const dream = makeDream(["a", "b", "c", "d", "e"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c"), makeKp("d"), makeKp("e")]);
    expect(describeKidProjectProgress(dream, graph, progressWith(["a", "c", "d"]))).toEqual({
      kicker: "skills",
      text: "3 of 5 ready",
      allReady: false,
    });
  });

  it("counts skipped KPs as ready via computeDreamReadiness", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const progress = emptyProgress();
    progress.knowledgePoints.a = {
      status: "saw_it",
      firstSeenAt: "t",
      updatedAt: "t",
      skipped: true,
    };
    expect(describeKidProjectProgress(dream, graph, progress)).toEqual({
      kicker: "skills",
      text: "1 of 2 ready",
      allReady: false,
    });
  });

  it("tolerates a null graph using progress-only counting", () => {
    const dream = makeDream(["a", "b", "c"]);
    expect(describeKidProjectProgress(dream, null, progressWith(["a", "c"]))).toEqual({
      kicker: "skills",
      text: "2 of 3 ready",
      allReady: false,
    });
  });

  it("uses 'skills' as the kicker label", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const result = describeKidProjectProgress(dream, graph, progressWith(["a"]));
    expect(result?.kicker).toBe("skills");
  });

  it("marks allReady true on the ready-to-finish branch and false on partial", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const partial = describeKidProjectProgress(dream, graph, progressWith(["a"]));
    const allReady = describeKidProjectProgress(dream, graph, progressWith(["a", "b"]));
    expect(partial?.allReady).toBe(false);
    expect(allReady?.allReady).toBe(true);
  });
});
