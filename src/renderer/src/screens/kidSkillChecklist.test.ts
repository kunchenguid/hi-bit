import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { buildKidSkillChecklist } from "./kidSkillChecklist";

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

describe("buildKidSkillChecklist", () => {
  it("returns null when dream is null", () => {
    expect(buildKidSkillChecklist(null, graphOf([]), emptyProgress(), null)).toBeNull();
  });

  it("returns null when graph is null", () => {
    const dream = makeDream(["a"]);
    expect(buildKidSkillChecklist(dream, null, emptyProgress(), null)).toBeNull();
  });

  it("returns null when dream has no required KPs", () => {
    const dream = makeDream([]);
    expect(buildKidSkillChecklist(dream, graphOf([]), emptyProgress(), null)).toBeNull();
  });

  it("renders all required KPs with kid titles preserving dream order", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a", "alpha"), makeKp("b", "bravo"), makeKp("c", "charlie")]);
    const result = buildKidSkillChecklist(dream, graph, emptyProgress(), null);
    expect(result?.items.map((i) => i.titleKid)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("marks done KPs as 'done' when they meet did_with_help", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a", "alpha"), makeKp("b", "bravo")]);
    const result = buildKidSkillChecklist(dream, graph, progressWith(["a"]), null);
    expect(result?.items[0]).toMatchObject({ id: "a", status: "done" });
    expect(result?.items[1]).toMatchObject({ id: "b", status: "pending" });
  });

  it("marks the nextUp KP with status 'next' when not yet done", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    const result = buildKidSkillChecklist(dream, graph, emptyProgress(), "b");
    expect(result?.items.map((i) => i.status)).toEqual(["pending", "next", "pending"]);
  });

  it("does not downgrade a done KP to 'next' even if nextUp matches it", () => {
    const dream = makeDream(["a"]);
    const graph = graphOf([makeKp("a")]);
    const result = buildKidSkillChecklist(dream, graph, progressWith(["a"]), "a");
    expect(result?.items[0]?.status).toBe("done");
  });

  it("treats skipped KPs as done", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const progress = emptyProgress();
    progress.knowledgePoints.a = {
      status: "saw_it",
      firstSeenAt: "t",
      updatedAt: "t",
      skipped: true,
    };
    const result = buildKidSkillChecklist(dream, graph, progress, null);
    expect(result?.items[0]?.status).toBe("done");
  });

  it("computes doneCount and totalCount", () => {
    const dream = makeDream(["a", "b", "c"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c")]);
    const result = buildKidSkillChecklist(dream, graph, progressWith(["a", "c"]), null);
    expect(result?.doneCount).toBe(2);
    expect(result?.totalCount).toBe(3);
  });

  it("composes a sentence-case summary string", () => {
    const dream = makeDream(["a", "b", "c", "d", "e"]);
    const graph = graphOf([makeKp("a"), makeKp("b"), makeKp("c"), makeKp("d"), makeKp("e")]);
    const result = buildKidSkillChecklist(dream, graph, progressWith(["a", "b"]), "c");
    expect(result?.summary).toBe("2 of 5 done");
  });

  it("handles null progress as all-pending", () => {
    const dream = makeDream(["a", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const result = buildKidSkillChecklist(dream, graph, null, null);
    expect(result?.items.map((i) => i.status)).toEqual(["pending", "pending"]);
    expect(result?.doneCount).toBe(0);
  });

  it("skips KPs that are missing from the graph (unresolved)", () => {
    const dream = makeDream(["a", "ghost", "b"]);
    const graph = graphOf([makeKp("a"), makeKp("b")]);
    const result = buildKidSkillChecklist(dream, graph, emptyProgress(), null);
    expect(result?.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result?.totalCount).toBe(2);
  });

  it("returns null when every required KP is unresolved", () => {
    const dream = makeDream(["ghost1", "ghost2"]);
    const graph = graphOf([]);
    expect(buildKidSkillChecklist(dream, graph, emptyProgress(), null)).toBeNull();
  });
});
