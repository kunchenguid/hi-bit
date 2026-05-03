import type { Dream, DreamCategory, DreamLibrary } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { buildDreamHistoryList } from "./dreamHistoryList";

function makeDream(
  id: string,
  parentTitle: string,
  over: { categories?: DreamCategory[] } = {},
): Dream {
  return {
    id,
    title_parent: parentTitle,
    title_kid: id,
    summary_kid: "x",
    categories: over.categories ?? ["arcade"],
    interest_tags: [],
    requires: [],
    style_hints: [],
    emoji: "✨",
    difficulty: 1,
  };
}

function libraryOf(dreams: Dream[]): DreamLibrary {
  return { dreams, byId: Object.fromEntries(dreams.map((d) => [d.id, d])) };
}

describe("buildDreamHistoryList", () => {
  it("returns empty list when history is empty", () => {
    expect(buildDreamHistoryList({ dreamHistory: [], library: libraryOf([]) })).toEqual([]);
  });

  it("returns entries in most-recent-first order (reverse of append order)", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake", "pong", "to-do-list"],
      library: libraryOf([]),
    });
    expect(result.map((e) => e.dreamId)).toEqual(["to-do-list", "pong", "snake"]);
  });

  it("uses the parent-facing title from the library when available", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake"],
      library: libraryOf([makeDream("snake", "Snake (canvas keyboard loop)")]),
    });
    expect(result[0].title).toBe("Snake (canvas keyboard loop)");
    expect(result[0].isKnown).toBe(true);
  });

  it("falls back to the dreamId and marks isKnown=false when missing from the library", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["ghost"],
      library: libraryOf([makeDream("snake", "Snake")]),
    });
    expect(result[0]).toMatchObject({ dreamId: "ghost", title: "ghost", isKnown: false });
  });

  it("falls back to dreamId when library is null", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake"],
      library: null,
    });
    expect(result[0]).toMatchObject({ title: "snake", isKnown: false });
  });

  it("marks only the current-dream entry as isCurrent", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake", "pong"],
      library: libraryOf([]),
      currentDreamId: "snake",
    });
    const snake = result.find((e) => e.dreamId === "snake");
    const pong = result.find((e) => e.dreamId === "pong");
    expect(snake?.isCurrent).toBe(true);
    expect(pong?.isCurrent).toBe(false);
  });

  it("marks no entry as current when currentDreamId is null/undefined", () => {
    const a = buildDreamHistoryList({
      dreamHistory: ["snake"],
      library: libraryOf([]),
      currentDreamId: null,
    });
    const b = buildDreamHistoryList({
      dreamHistory: ["snake"],
      library: libraryOf([]),
    });
    expect(a[0].isCurrent).toBe(false);
    expect(b[0].isCurrent).toBe(false);
  });

  it("deduplicates repeated ids preserving the most recent occurrence", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake", "pong", "snake"],
      library: libraryOf([]),
    });
    expect(result.map((e) => e.dreamId)).toEqual(["snake", "pong"]);
  });

  it("skips empty and whitespace-only ids", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["", "   ", "snake"],
      library: libraryOf([]),
    });
    expect(result.map((e) => e.dreamId)).toEqual(["snake"]);
  });

  it("trims whitespace around ids", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["  snake  "],
      library: libraryOf([makeDream("snake", "Snake")]),
    });
    expect(result[0]).toMatchObject({ dreamId: "snake", title: "Snake", isKnown: true });
  });

  it("populates categories from the library when the dream is known", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake"],
      library: libraryOf([makeDream("snake", "Snake", { categories: ["arcade", "creative"] })]),
    });
    expect(result[0].categories).toEqual(["arcade", "creative"]);
  });

  it("falls back to empty categories when the dream id is unknown", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["ghost"],
      library: libraryOf([makeDream("snake", "Snake")]),
    });
    expect(result[0].categories).toEqual([]);
  });

  it("falls back to empty categories when the library is null", () => {
    const result = buildDreamHistoryList({
      dreamHistory: ["snake"],
      library: null,
    });
    expect(result[0].categories).toEqual([]);
  });
});
