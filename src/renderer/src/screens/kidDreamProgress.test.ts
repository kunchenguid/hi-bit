import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { describeKidDreamProgress } from "./kidDreamProgress";

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

describe("describeKidDreamProgress", () => {
  it("returns null when dream is null", () => {
    expect(describeKidDreamProgress(null, graphOf([]), emptyProgress())).toBeNull();
  });

  it("returns null for a dream with zero required KPs (nextUp shows ready)", () => {
    const dream = makeDream([]);
    expect(describeKidDreamProgress(dream, graphOf([]), emptyProgress())).toBeNull();
  });

  it("returns null when progress is null (nothing to celebrate yet)", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    expect(describeKidDreamProgress(dream, graph, null)).toBeNull();
  });

  it("returns null when all required KPs are ready (nextUp shows ready to build)", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    expect(describeKidDreamProgress(dream, graph, progressWith(["a", "b"]))).toBeNull();
  });

  it("returns null when readyCount is 0 (nothing motivating to show yet)", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    expect(describeKidDreamProgress(dream, graph, emptyProgress())).toBeNull();
  });

  it("returns a 'X of Y skills ready' pill for partial readiness", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    expect(describeKidDreamProgress(dream, graph, progressWith(["a"]))).toEqual({
      kicker: "dream",
      text: "1 of 3 skills ready",
    });
  });

  it("counts multiple ready skills correctly", () => {
    const dream = makeDream(["a", "b", "c", "d", "e"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c"), makeKp("d"), makeKp("e")]);
    expect(describeKidDreamProgress(dream, graph, progressWith(["a", "c", "d"]))).toEqual({
      kicker: "dream",
      text: "3 of 5 skills ready",
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
    expect(describeKidDreamProgress(dream, graph, progress)).toEqual({
      kicker: "dream",
      text: "1 of 2 skills ready",
    });
  });

  it("tolerates a null graph using progress-only counting", () => {
    const dream = makeDream(["a", "b", "c"]);
    expect(describeKidDreamProgress(dream, null, progressWith(["a", "c"]))).toEqual({
      kicker: "dream",
      text: "2 of 3 skills ready",
    });
  });

  it("uses 'dream' as the kicker label", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const result = describeKidDreamProgress(dream, graph, progressWith(["a"]));
    expect(result?.kicker).toBe("dream");
  });
});
