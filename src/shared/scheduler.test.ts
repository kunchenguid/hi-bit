import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type KnowledgePointStatus, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import {
  collectRequiredKps,
  isDreamDoable,
  isKpSkipped,
  kpLevel,
  kpMeets,
  pickNextKP,
  pickNextOpenKps,
} from "./scheduler";

function makeKp(id: string, prereqs: string[] = []): KnowledgePoint {
  return {
    id,
    title_parent: id,
    title_kid: id,
    area: "html",
    prereqs,
    introduces: [],
    mastery_signals: {
      saw_it: "s",
      did_with_help: "d",
      did_unprompted: "u",
      explained_it: "e",
    },
  };
}

function graphOf(nodes: KnowledgePoint[]): KnowledgeGraph {
  return { nodes, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

function makeDream(requires: string[], overrides: Partial<Dream> = {}): Dream {
  return {
    id: "test-dream",
    title_parent: "Test",
    title_kid: "test",
    summary_kid: "a test",
    categories: ["arcade"],
    interest_tags: [],
    requires,
    style_hints: [],
    emoji: "✨",
    ...overrides,
    difficulty: overrides.difficulty ?? 1,
  };
}

function progressAt(levels: Record<string, KnowledgePointStatus>): Progress {
  const p = emptyProgress();
  const now = "2026-04-23T00:00:00.000Z";
  for (const [id, status] of Object.entries(levels)) {
    p.knowledgePoints[id] = { status, firstSeenAt: now, updatedAt: now };
  }
  return p;
}

describe("kpLevel", () => {
  it("returns null for a KP the kid has never seen", () => {
    expect(kpLevel(emptyProgress(), "events-click")).toBeNull();
  });

  it("returns the recorded status when present", () => {
    const p = progressAt({ "events-click": "did_with_help" });
    expect(kpLevel(p, "events-click")).toBe("did_with_help");
  });
});

describe("kpMeets", () => {
  it("returns false when the kid has not seen the KP", () => {
    expect(kpMeets(emptyProgress(), "x", "saw_it")).toBe(false);
  });

  it("returns false when the current level is below the threshold", () => {
    const p = progressAt({ x: "saw_it" });
    expect(kpMeets(p, "x", "did_with_help")).toBe(false);
  });

  it("returns true when the current level equals the threshold", () => {
    const p = progressAt({ x: "did_with_help" });
    expect(kpMeets(p, "x", "did_with_help")).toBe(true);
  });

  it("returns true when the current level is above the threshold", () => {
    const p = progressAt({ x: "did_unprompted" });
    expect(kpMeets(p, "x", "did_with_help")).toBe(true);
  });
});

describe("collectRequiredKps", () => {
  it("returns prereqs in topological order (leaves first)", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"]), makeKp("c", ["b"])]);
    const { ordered } = collectRequiredKps(graph, makeDream(["c"]));
    expect(ordered).toEqual(["a", "b", "c"]);
  });

  it("deduplicates shared ancestors across branches", () => {
    const graph = graphOf([
      makeKp("root"),
      makeKp("left", ["root"]),
      makeKp("right", ["root"]),
      makeKp("top", ["left", "right"]),
    ]);
    const { ordered } = collectRequiredKps(graph, makeDream(["top"]));
    expect(ordered.filter((id) => id === "root")).toEqual(["root"]);
    expect(ordered[ordered.length - 1]).toBe("top");
    expect(ordered).toHaveLength(4);
  });

  it("records unresolved KP ids separately without throwing", () => {
    const graph = graphOf([makeKp("known")]);
    const { ordered, unresolved } = collectRequiredKps(graph, makeDream(["known", "ghost"]));
    expect(ordered).toEqual(["known"]);
    expect(unresolved).toEqual(["ghost"]);
  });
});

describe("isDreamDoable", () => {
  it("returns false when any required KP is not met at threshold", () => {
    const dream = makeDream(["a", "b"]);
    const p = progressAt({ a: "did_with_help" });
    expect(isDreamDoable(dream, p)).toBe(false);
  });

  it("returns true when all required KPs meet the default threshold", () => {
    const dream = makeDream(["a", "b"]);
    const p = progressAt({ a: "did_with_help", b: "did_unprompted" });
    expect(isDreamDoable(dream, p)).toBe(true);
  });

  it("respects a stricter threshold when passed", () => {
    const dream = makeDream(["a"]);
    const p = progressAt({ a: "did_with_help" });
    expect(isDreamDoable(dream, p, { threshold: "did_unprompted" })).toBe(false);
  });
});

describe("pickNextKP", () => {
  it("picks the deepest unmet prereq first (topo-earliest teachable KP)", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"]), makeKp("c", ["b"])]);
    const dream = makeDream(["c"]);
    expect(pickNextKP(graph, dream, emptyProgress())).toBe("a");
  });

  it("skips KPs the kid already meets the taught threshold for", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"]), makeKp("c", ["b"])]);
    const dream = makeDream(["c"]);
    const p = progressAt({ a: "did_with_help", b: "did_with_help" });
    expect(pickNextKP(graph, dream, p)).toBe("c");
  });

  it("skips KPs whose prereqs are not yet met", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"]), makeKp("c", ["b"])]);
    const dream = makeDream(["c"]);
    const p = progressAt({ a: "saw_it" });
    // a is still below did_with_help, so b and c are not teachable
    expect(pickNextKP(graph, dream, p)).toBe("a");
  });

  it("returns null when every required KP is already at or above the taught threshold", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"])]);
    const dream = makeDream(["b"]);
    const p = progressAt({ a: "did_with_help", b: "did_with_help" });
    expect(pickNextKP(graph, dream, p)).toBeNull();
  });

  it("ignores dream requires that are unresolved in the graph", () => {
    const graph = graphOf([makeKp("a")]);
    const dream = makeDream(["a", "ghost"]);
    expect(pickNextKP(graph, dream, emptyProgress())).toBe("a");
  });

  it("honors a custom taughtThreshold (e.g. did_unprompted)", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"])]);
    const dream = makeDream(["b"]);
    const p = progressAt({ a: "did_with_help", b: "did_with_help" });
    // With a stricter taughtThreshold, 'a' is no longer considered taught-enough
    expect(pickNextKP(graph, dream, p, { taughtThreshold: "did_unprompted" })).toBe("a");
  });
});

describe("isKpSkipped", () => {
  it("returns false when no KP entry exists", () => {
    expect(isKpSkipped(emptyProgress(), "css-colors")).toBe(false);
  });

  it("returns false when a KP exists but has no skipped flag", () => {
    const p = progressAt({ "css-colors": "saw_it" });
    expect(isKpSkipped(p, "css-colors")).toBe(false);
  });

  it("returns true when the KP entry carries skipped=true", () => {
    const p = progressAt({ "css-colors": "saw_it" });
    const entry = p.knowledgePoints["css-colors"];
    if (entry) entry.skipped = true;
    expect(isKpSkipped(p, "css-colors")).toBe(true);
  });
});

describe("kpMeets with skipped flag", () => {
  it("treats a skipped KP as meeting any threshold, even with no status recorded", () => {
    const p = emptyProgress();
    p.knowledgePoints["css-colors"] = {
      status: "saw_it",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      skipped: true,
    };
    expect(kpMeets(p, "css-colors", "explained_it")).toBe(true);
  });
});

describe("pickNextKP with skipped KPs", () => {
  it("skips KPs marked as skipped even when their level is below the taught threshold", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"]), makeKp("c", ["b"])]);
    const dream = makeDream(["c"]);
    const p = emptyProgress();
    p.knowledgePoints.a = {
      status: "saw_it",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      skipped: true,
    };
    expect(pickNextKP(graph, dream, p)).toBe("b");
  });

  it("returns null when the last required KP is skipped and everything else is taught", () => {
    const graph = graphOf([makeKp("a"), makeKp("b", ["a"])]);
    const dream = makeDream(["b"]);
    const p = progressAt({ a: "did_with_help" });
    p.knowledgePoints.b = {
      status: "saw_it",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      skipped: true,
    };
    expect(pickNextKP(graph, dream, p)).toBeNull();
  });
});

describe("pickNextOpenKps", () => {
  it("returns a small set of teachable unlearned KPs across the graph", () => {
    const graph = graphOf([
      makeKp("run-and-preview"),
      makeKp("web-page-parts", ["run-and-preview"]),
      makeKp("html-tags-basics", ["web-page-parts"]),
      makeKp("css-colors", ["html-tags-basics"]),
    ]);
    const progress = progressAt({ "run-and-preview": "did_with_help" });

    expect(pickNextOpenKps(graph, progress, { limit: 2 })).toEqual(["web-page-parts"]);
  });

  it("keeps started-but-not-taught KPs before later prereq-dependent KPs", () => {
    const graph = graphOf([
      makeKp("run-and-preview"),
      makeKp("web-page-parts", ["run-and-preview"]),
    ]);
    const progress = progressAt({ "run-and-preview": "saw_it" });

    expect(pickNextOpenKps(graph, progress)).toEqual(["run-and-preview"]);
  });
});

describe("isDreamDoable with skipped KPs", () => {
  it("treats skipped required KPs as doable without a mastered status", () => {
    const dream = makeDream(["a", "b"]);
    const p = progressAt({ a: "did_with_help" });
    p.knowledgePoints.b = {
      status: "saw_it",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      skipped: true,
    };
    expect(isDreamDoable(dream, p)).toBe(true);
  });
});
