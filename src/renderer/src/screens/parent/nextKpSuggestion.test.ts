import type { Dream, DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { chooseNextSuggestion } from "./nextKpSuggestion";

function makeKp(id: string, prereqs: string[] = []): KnowledgePoint {
  return {
    id,
    title_parent: `${id} parent`,
    title_kid: `${id} kid`,
    area: "html",
    prereqs,
    introduces: [],
    mastery_signals: { saw_it: "s", did_with_help: "d", did_unprompted: "u", explained_it: "e" },
  };
}

function makeGraph(nodes: KnowledgePoint[]): KnowledgeGraph {
  return { nodes, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

function makeDream(id: string, requires: string[]): Dream {
  return {
    id,
    title_parent: id,
    title_kid: id,
    summary_kid: "x",
    categories: ["arcade"],
    interest_tags: [],
    requires,
    style_hints: [],
    emoji: "✨",
    difficulty: 1,
  };
}

function libraryOf(dreams: Dream[]): DreamLibrary {
  return { dreams, byId: Object.fromEntries(dreams.map((d) => [d.id, d])) };
}

const baseProgress: Progress = emptyProgress();

describe("chooseNextSuggestion", () => {
  it("returns no-dream when currentDreamId is missing", () => {
    const result = chooseNextSuggestion({
      graph: makeGraph([]),
      library: libraryOf([]),
      currentDreamId: null,
      progress: baseProgress,
    });
    expect(result).toEqual({ kind: "no-dream" });
  });

  it("returns loading when graph or library is null", () => {
    const a = chooseNextSuggestion({
      graph: null,
      library: libraryOf([]),
      currentDreamId: "d1",
      progress: baseProgress,
    });
    const b = chooseNextSuggestion({
      graph: makeGraph([]),
      library: null,
      currentDreamId: "d1",
      progress: baseProgress,
    });
    expect(a).toEqual({ kind: "loading" });
    expect(b).toEqual({ kind: "loading" });
  });

  it("returns unknown-dream when dreamId is not in the library", () => {
    const result = chooseNextSuggestion({
      graph: makeGraph([]),
      library: libraryOf([]),
      currentDreamId: "ghost",
      progress: baseProgress,
    });
    expect(result).toEqual({ kind: "unknown-dream", dreamId: "ghost" });
  });

  it("returns unresolved-prereqs when the dream requires a missing kp", () => {
    const dream = makeDream("d1", ["missing-kp"]);
    const result = chooseNextSuggestion({
      graph: makeGraph([]),
      library: libraryOf([dream]),
      currentDreamId: "d1",
      progress: baseProgress,
    });
    expect(result).toEqual({ kind: "unresolved-prereqs", missing: ["missing-kp"] });
  });

  it("returns next-kp pointing at the deepest unmet prereq", () => {
    const a = makeKp("a");
    const b = makeKp("b", ["a"]);
    const dream = makeDream("d1", ["b"]);
    const result = chooseNextSuggestion({
      graph: makeGraph([a, b]),
      library: libraryOf([dream]),
      currentDreamId: "d1",
      progress: baseProgress,
    });
    expect(result.kind).toBe("next-kp");
    if (result.kind === "next-kp") expect(result.kp.id).toBe("a");
  });

  it("includes the current progress status for the suggested KP", () => {
    const a = makeKp("a");
    const dream = makeDream("d1", ["a"]);
    const progress: Progress = {
      ...baseProgress,
      knowledgePoints: {
        a: { status: "saw_it", firstSeenAt: "x", updatedAt: "x" },
      },
    };
    const result = chooseNextSuggestion({
      graph: makeGraph([a]),
      library: libraryOf([dream]),
      currentDreamId: "d1",
      progress,
    });
    expect(result.kind).toBe("next-kp");
    if (result.kind === "next-kp") expect(result.status).toBe("saw_it");
  });

  it("returns all-done when all kps in the dream's closure meet the threshold", () => {
    const a = makeKp("a");
    const dream = makeDream("d1", ["a"]);
    const progress: Progress = {
      ...baseProgress,
      knowledgePoints: {
        a: { status: "did_with_help", firstSeenAt: "x", updatedAt: "x" },
      },
    };
    const result = chooseNextSuggestion({
      graph: makeGraph([a]),
      library: libraryOf([dream]),
      currentDreamId: "d1",
      progress,
    });
    expect(result).toEqual({ kind: "all-done" });
  });
});
