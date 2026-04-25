import type { Dream, DreamLibrary } from "@shared/dreams";
import type { ProjectEntry } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { buildParentProjectRows } from "./parentProjectRows";

function makeDream(id: string, parentTitle: string): Dream {
  return {
    id,
    title_parent: parentTitle,
    title_kid: id,
    summary_kid: "x",
    categories: ["arcade"],
    interest_tags: [],
    requires: [],
    style_hints: [],
    emoji: "✨",
  };
}

function libraryOf(dreams: Dream[]): DreamLibrary {
  return { dreams, byId: Object.fromEntries(dreams.map((d) => [d.id, d])) };
}

function makeEntry(slug: string, dreamId: string, lastActiveAt: string): ProjectEntry {
  return { slug, dreamId, startedAt: lastActiveAt, lastActiveAt };
}

describe("buildParentProjectRows", () => {
  it("returns empty list when slugs is empty", () => {
    expect(buildParentProjectRows({ slugs: [], projects: [], library: libraryOf([]) })).toEqual([]);
  });

  it("enriches each slug with dream title_parent, dreamId, lastActiveAt", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake"],
      projects: [makeEntry("snake", "snake", "2026-04-23T10:00:00.000Z")],
      library: libraryOf([makeDream("snake", "Snake (canvas keyboard loop)")]),
    });
    expect(rows).toEqual([
      {
        slug: "snake",
        dreamId: "snake",
        title: "Snake (canvas keyboard loop)",
        startedAt: "2026-04-23T10:00:00.000Z",
        lastActiveAt: "2026-04-23T10:00:00.000Z",
        isCurrent: false,
        isKnown: true,
      },
    ]);
  });

  it("preserves a distinct startedAt when the project was started earlier", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake"],
      projects: [
        {
          slug: "snake",
          dreamId: "snake",
          startedAt: "2026-04-20T09:00:00.000Z",
          lastActiveAt: "2026-04-23T10:00:00.000Z",
        },
      ],
      library: libraryOf([]),
    });
    expect(rows[0]).toMatchObject({
      startedAt: "2026-04-20T09:00:00.000Z",
      lastActiveAt: "2026-04-23T10:00:00.000Z",
    });
  });

  it("sorts by lastActiveAt descending when both rows have timestamps", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake", "pong"],
      projects: [
        makeEntry("snake", "snake", "2026-04-20T00:00:00.000Z"),
        makeEntry("pong", "pong", "2026-04-23T00:00:00.000Z"),
      ],
      library: libraryOf([]),
    });
    expect(rows.map((r) => r.slug)).toEqual(["pong", "snake"]);
  });

  it("places rows without progress after rows with progress, then alphabetical", () => {
    const rows = buildParentProjectRows({
      slugs: ["zebra", "apple", "snake"],
      projects: [makeEntry("snake", "snake", "2026-04-20T00:00:00.000Z")],
      library: libraryOf([]),
    });
    expect(rows.map((r) => r.slug)).toEqual(["snake", "apple", "zebra"]);
  });

  it("falls back to dreamId when the library lacks the dream", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake"],
      projects: [makeEntry("snake", "snake", "2026-04-20T00:00:00.000Z")],
      library: libraryOf([]),
    });
    expect(rows[0]).toMatchObject({ title: "snake", isKnown: false });
  });

  it("falls back to slug and keeps dreamId=null when no progress entry exists", () => {
    const rows = buildParentProjectRows({
      slugs: ["orphan"],
      projects: [],
      library: libraryOf([makeDream("snake", "Snake")]),
    });
    expect(rows[0]).toEqual({
      slug: "orphan",
      dreamId: null,
      title: "orphan",
      startedAt: null,
      lastActiveAt: null,
      isCurrent: false,
      isKnown: false,
    });
  });

  it("marks the row matching currentDreamId as isCurrent", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake", "pong"],
      projects: [
        makeEntry("snake", "snake", "2026-04-20T00:00:00.000Z"),
        makeEntry("pong", "pong", "2026-04-23T00:00:00.000Z"),
      ],
      library: libraryOf([]),
      currentDreamId: "pong",
    });
    expect(rows.find((r) => r.slug === "pong")?.isCurrent).toBe(true);
    expect(rows.find((r) => r.slug === "snake")?.isCurrent).toBe(false);
  });

  it("marks no row as current when currentDreamId is null or missing", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake"],
      projects: [makeEntry("snake", "snake", "2026-04-20T00:00:00.000Z")],
      library: libraryOf([]),
      currentDreamId: null,
    });
    expect(rows[0].isCurrent).toBe(false);
  });

  it("tolerates null library", () => {
    const rows = buildParentProjectRows({
      slugs: ["snake"],
      projects: [makeEntry("snake", "snake", "2026-04-20T00:00:00.000Z")],
      library: null,
    });
    expect(rows[0]).toMatchObject({ title: "snake", isKnown: false });
  });
});
