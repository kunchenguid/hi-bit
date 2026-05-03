import type { Dream, DreamCategory } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { normalizeDreamSearchQuery, searchDreamsByText } from "./dreamSearch";

function makeDream(id: string, overrides: Partial<Dream> = {}): Dream {
  return {
    id,
    title_parent: overrides.title_parent ?? id,
    title_kid: overrides.title_kid ?? id,
    summary_kid: overrides.summary_kid ?? id,
    categories: overrides.categories ?? (["arcade"] as DreamCategory[]),
    interest_tags: overrides.interest_tags ?? [],
    requires: overrides.requires ?? [],
    style_hints: overrides.style_hints ?? [],
    emoji: overrides.emoji ?? "✨",
    difficulty: overrides.difficulty ?? 1,
  };
}

describe("normalizeDreamSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeDreamSearchQuery("  Snake  Game  ")).toBe("snake game");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeDreamSearchQuery("")).toBe("");
    expect(normalizeDreamSearchQuery("   ")).toBe("");
    expect(normalizeDreamSearchQuery("\t\n")).toBe("");
  });
});

describe("searchDreamsByText", () => {
  it("returns all dreams unchanged when query is blank", () => {
    const dreams = [makeDream("a"), makeDream("b")];
    expect(searchDreamsByText(dreams, "")).toEqual(dreams);
    expect(searchDreamsByText(dreams, "   ")).toEqual(dreams);
  });

  it("preserves input order when query is blank", () => {
    const dreams = [makeDream("z"), makeDream("a")];
    expect(searchDreamsByText(dreams, "").map((d) => d.id)).toEqual(["z", "a"]);
  });

  it("matches the kid-facing title case-insensitively", () => {
    const dreams = [
      makeDream("snake", { title_kid: "Snake Game" }),
      makeDream("pet", { title_kid: "Pet Page" }),
    ];
    expect(searchDreamsByText(dreams, "snake").map((d) => d.id)).toEqual(["snake"]);
    expect(searchDreamsByText(dreams, "SNAKE").map((d) => d.id)).toEqual(["snake"]);
  });

  it("matches the parent-facing title", () => {
    const dreams = [
      makeDream("a", { title_parent: "DOM event listeners sandbox", title_kid: "click fun" }),
      makeDream("b", { title_parent: "Canvas drawing", title_kid: "doodle" }),
    ];
    expect(searchDreamsByText(dreams, "canvas").map((d) => d.id)).toEqual(["b"]);
  });

  it("matches on the kid-facing summary", () => {
    const dreams = [
      makeDream("a", { summary_kid: "Make a bouncy ball that follows your cursor." }),
      makeDream("b", { summary_kid: "A reaction game with flashy colors." }),
    ];
    expect(searchDreamsByText(dreams, "bouncy").map((d) => d.id)).toEqual(["a"]);
    expect(searchDreamsByText(dreams, "flashy").map((d) => d.id)).toEqual(["b"]);
  });

  it("matches interest tags", () => {
    const dreams = [
      makeDream("a", { interest_tags: ["cats", "space"] }),
      makeDream("b", { interest_tags: ["sports"] }),
    ];
    expect(searchDreamsByText(dreams, "cats").map((d) => d.id)).toEqual(["a"]);
    expect(searchDreamsByText(dreams, "sports").map((d) => d.id)).toEqual(["b"]);
  });

  it("matches category names", () => {
    const dreams = [
      makeDream("a", { categories: ["arcade"] }),
      makeDream("b", { categories: ["art"] }),
    ];
    expect(searchDreamsByText(dreams, "art").map((d) => d.id)).toEqual(["b"]);
  });

  it("treats multi-word queries as AND across tokens", () => {
    const dreams = [
      makeDream("a", {
        title_kid: "Snake",
        summary_kid: "classic arcade game",
        categories: ["arcade"],
      }),
      makeDream("b", {
        title_kid: "Snake charmer",
        summary_kid: "a music thing",
        categories: ["creative"],
      }),
      makeDream("c", {
        title_kid: "Pong",
        summary_kid: "arcade classic",
        categories: ["arcade"],
      }),
    ];
    expect(searchDreamsByText(dreams, "snake arcade").map((d) => d.id)).toEqual(["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    const dreams = [makeDream("a", { title_kid: "cats" })];
    expect(searchDreamsByText(dreams, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchDreamsByText([], "")).toEqual([]);
    expect(searchDreamsByText([], "snake")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const dreams = [
      makeDream("z", { title_kid: "game z" }),
      makeDream("a", { title_kid: "game a" }),
    ];
    expect(searchDreamsByText(dreams, "game").map((d) => d.id)).toEqual(["z", "a"]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const dreams = [makeDream("a", { title_kid: "Snake Game" })];
    expect(searchDreamsByText(dreams, "  snake   game  ").map((d) => d.id)).toEqual(["a"]);
  });
});
