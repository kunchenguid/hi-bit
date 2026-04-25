import type { DreamCategory } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import type { KidProjectListEntry } from "./kidProjectsList";
import { normalizeKidProjectsSearchQuery, searchKidProjectsByText } from "./kidProjectsSearch";

function makeEntry(
  dreamId: string,
  overrides: Partial<KidProjectListEntry> = {},
): KidProjectListEntry {
  return {
    dreamId,
    slug: overrides.slug ?? dreamId,
    title: overrides.title ?? dreamId,
    summary: overrides.summary ?? null,
    categories: overrides.categories ?? (["arcade"] as DreamCategory[]),
    startedAt: overrides.startedAt ?? "2026-04-01T00:00:00Z",
    lastActiveAt: overrides.lastActiveAt ?? "2026-04-01T00:00:00Z",
    isCurrent: overrides.isCurrent ?? false,
  };
}

describe("normalizeKidProjectsSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeKidProjectsSearchQuery("  My  Snake  ")).toBe("my snake");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeKidProjectsSearchQuery("")).toBe("");
    expect(normalizeKidProjectsSearchQuery("   ")).toBe("");
    expect(normalizeKidProjectsSearchQuery("\t\n")).toBe("");
  });
});

describe("searchKidProjectsByText", () => {
  it("returns all entries unchanged when query is blank", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    expect(searchKidProjectsByText(entries, "")).toEqual(entries);
    expect(searchKidProjectsByText(entries, "   ")).toEqual(entries);
  });

  it("preserves input order when query is blank", () => {
    const entries = [makeEntry("z"), makeEntry("a")];
    expect(searchKidProjectsByText(entries, "").map((e) => e.dreamId)).toEqual(["z", "a"]);
  });

  it("matches the kid-facing title case-insensitively", () => {
    const entries = [
      makeEntry("snake", { title: "Snake Game" }),
      makeEntry("pet", { title: "Pet Page" }),
    ];
    expect(searchKidProjectsByText(entries, "snake").map((e) => e.dreamId)).toEqual(["snake"]);
    expect(searchKidProjectsByText(entries, "SNAKE").map((e) => e.dreamId)).toEqual(["snake"]);
  });

  it("matches on the summary", () => {
    const entries = [
      makeEntry("a", { summary: "Make a bouncy ball that follows your cursor." }),
      makeEntry("b", { summary: "A reaction game with flashy colors." }),
    ];
    expect(searchKidProjectsByText(entries, "bouncy").map((e) => e.dreamId)).toEqual(["a"]);
    expect(searchKidProjectsByText(entries, "flashy").map((e) => e.dreamId)).toEqual(["b"]);
  });

  it("tolerates a null summary", () => {
    const entries = [makeEntry("a", { summary: null, title: "ball" })];
    expect(searchKidProjectsByText(entries, "ball").map((e) => e.dreamId)).toEqual(["a"]);
    expect(searchKidProjectsByText(entries, "missing")).toEqual([]);
  });

  it("matches on the dreamId", () => {
    const entries = [
      makeEntry("click-me", { title: "Click page" }),
      makeEntry("pet-page", { title: "Pet page" }),
    ];
    expect(searchKidProjectsByText(entries, "click-me").map((e) => e.dreamId)).toEqual([
      "click-me",
    ]);
  });

  it("matches on the slug", () => {
    const entries = [
      makeEntry("a", { slug: "snake-adventure", title: "unrelated" }),
      makeEntry("b", { slug: "pet-city", title: "unrelated" }),
    ];
    expect(searchKidProjectsByText(entries, "adventure").map((e) => e.dreamId)).toEqual(["a"]);
  });

  it("matches category names", () => {
    const entries = [
      makeEntry("a", { categories: ["arcade"] }),
      makeEntry("b", { categories: ["art"] }),
    ];
    expect(searchKidProjectsByText(entries, "art").map((e) => e.dreamId)).toEqual(["b"]);
  });

  it("treats multi-word queries as AND across tokens", () => {
    const entries = [
      makeEntry("a", {
        title: "Snake",
        summary: "classic arcade game",
        categories: ["arcade"],
      }),
      makeEntry("b", {
        title: "Snake charmer",
        summary: "a music thing",
        categories: ["creative"],
      }),
      makeEntry("c", {
        title: "Pong",
        summary: "arcade classic",
        categories: ["arcade"],
      }),
    ];
    expect(searchKidProjectsByText(entries, "snake arcade").map((e) => e.dreamId)).toEqual(["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    const entries = [makeEntry("a", { title: "cats" })];
    expect(searchKidProjectsByText(entries, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchKidProjectsByText([], "")).toEqual([]);
    expect(searchKidProjectsByText([], "snake")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const entries = [makeEntry("z", { title: "game z" }), makeEntry("a", { title: "game a" })];
    expect(searchKidProjectsByText(entries, "game").map((e) => e.dreamId)).toEqual(["z", "a"]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const entries = [makeEntry("a", { title: "Snake Game" })];
    expect(searchKidProjectsByText(entries, "  snake   game  ").map((e) => e.dreamId)).toEqual([
      "a",
    ]);
  });
});
