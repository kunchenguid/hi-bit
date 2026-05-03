import type { Dream, DreamCategory, DreamLibrary } from "@shared/dreams";
import type { ProjectEntry } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { buildKidProjectList } from "./kidProjectsList";

function makeDream(
  id: string,
  kidTitle: string,
  over: Partial<Pick<Dream, "summary_kid" | "categories">> = {},
): Dream {
  return {
    id,
    title_parent: id,
    title_kid: kidTitle,
    summary_kid: over.summary_kid ?? "x",
    categories: (over.categories ?? ["arcade"]) as DreamCategory[],
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

function makeEntry(over: Partial<ProjectEntry> = {}): ProjectEntry {
  return {
    dreamId: "snake",
    slug: "snake",
    startedAt: "2026-04-22T10:00:00.000Z",
    lastActiveAt: "2026-04-22T10:00:00.000Z",
    ...over,
  };
}

describe("buildKidProjectList", () => {
  it("returns empty list when no projects", () => {
    expect(buildKidProjectList({ projects: [], library: libraryOf([]) })).toEqual([]);
  });

  it("looks up the kid-friendly title from the library", () => {
    const result = buildKidProjectList({
      projects: [makeEntry()],
      library: libraryOf([makeDream("snake", "snake game")]),
    });
    expect(result[0].title).toBe("snake game");
  });

  it("falls back to dreamId when the library does not know the dream", () => {
    const result = buildKidProjectList({
      projects: [makeEntry({ dreamId: "ghost" })],
      library: libraryOf([]),
    });
    expect(result[0].title).toBe("ghost");
  });

  it("falls back to dreamId when library is null", () => {
    const result = buildKidProjectList({
      projects: [makeEntry({ dreamId: "snake" })],
      library: null,
    });
    expect(result[0].title).toBe("snake");
  });

  it("sorts entries by lastActiveAt descending", () => {
    const older = makeEntry({ dreamId: "a", lastActiveAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeEntry({ dreamId: "b", lastActiveAt: "2026-04-22T10:00:00.000Z" });
    const middle = makeEntry({ dreamId: "c", lastActiveAt: "2026-02-15T00:00:00.000Z" });
    const result = buildKidProjectList({
      projects: [older, newer, middle],
      library: libraryOf([]),
    });
    expect(result.map((e) => e.dreamId)).toEqual(["b", "c", "a"]);
  });

  it("marks the current dream entry as isCurrent", () => {
    const result = buildKidProjectList({
      projects: [makeEntry({ dreamId: "snake" }), makeEntry({ dreamId: "pong" })],
      library: libraryOf([]),
      currentDreamId: "snake",
    });
    const snake = result.find((e) => e.dreamId === "snake");
    const pong = result.find((e) => e.dreamId === "pong");
    expect(snake?.isCurrent).toBe(true);
    expect(pong?.isCurrent).toBe(false);
  });

  it("marks no entry as current when currentDreamId is null or undefined", () => {
    const a = buildKidProjectList({
      projects: [makeEntry()],
      library: libraryOf([]),
      currentDreamId: null,
    });
    const b = buildKidProjectList({
      projects: [makeEntry()],
      library: libraryOf([]),
    });
    expect(a[0].isCurrent).toBe(false);
    expect(b[0].isCurrent).toBe(false);
  });

  it("preserves slug and timestamps from the project entry", () => {
    const result = buildKidProjectList({
      projects: [
        makeEntry({
          dreamId: "snake",
          slug: "snake",
          startedAt: "2026-04-01T00:00:00.000Z",
          lastActiveAt: "2026-04-22T10:00:00.000Z",
        }),
      ],
      library: libraryOf([]),
    });
    expect(result[0]).toMatchObject({
      slug: "snake",
      startedAt: "2026-04-01T00:00:00.000Z",
      lastActiveAt: "2026-04-22T10:00:00.000Z",
    });
  });

  it("populates the kid-facing summary from the library", () => {
    const result = buildKidProjectList({
      projects: [makeEntry()],
      library: libraryOf([
        makeDream("snake", "snake game", { summary_kid: "make a snake eat food" }),
      ]),
    });
    expect(result[0].summary).toBe("make a snake eat food");
  });

  it("populates categories from the library", () => {
    const result = buildKidProjectList({
      projects: [makeEntry()],
      library: libraryOf([
        makeDream("snake", "snake game", { categories: ["arcade", "creative"] }),
      ]),
    });
    expect(result[0].categories).toEqual(["arcade", "creative"]);
  });

  it("returns null summary and empty categories when the library does not know the dream", () => {
    const result = buildKidProjectList({
      projects: [makeEntry({ dreamId: "ghost" })],
      library: libraryOf([]),
    });
    expect(result[0].summary).toBeNull();
    expect(result[0].categories).toEqual([]);
  });

  it("returns null summary and empty categories when library is null", () => {
    const result = buildKidProjectList({
      projects: [makeEntry({ dreamId: "snake" })],
      library: null,
    });
    expect(result[0].summary).toBeNull();
    expect(result[0].categories).toEqual([]);
  });
});
