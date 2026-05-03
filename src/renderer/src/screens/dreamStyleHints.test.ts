import type { Dream } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE_HINT_LIMIT, describeDreamStyleHints } from "./dreamStyleHints";

function makeDream(style_hints: string[]): Dream {
  return {
    id: "d1",
    title_parent: "d1",
    title_kid: "d1",
    summary_kid: "d1",
    categories: ["arcade"],
    interest_tags: [],
    requires: [],
    style_hints,
    emoji: "✨",
    difficulty: 1,
  };
}

describe("describeDreamStyleHints", () => {
  it("returns null when style_hints is empty", () => {
    expect(describeDreamStyleHints(makeDream([]))).toBeNull();
  });

  it("returns null when style_hints is only whitespace entries", () => {
    expect(describeDreamStyleHints(makeDream(["  ", "\t", ""]))).toBeNull();
  });

  it("returns a single item when exactly one hint", () => {
    const result = describeDreamStyleHints(makeDream(["the pet's name"]));
    expect(result).toEqual({
      kicker: "Make it yours",
      items: ["the pet's name"],
      truncated: false,
    });
  });

  it("returns all items when count equals the default limit", () => {
    const hints = ["the pet's name", "the pet's type", "a few fun facts"];
    const result = describeDreamStyleHints(makeDream(hints));
    expect(result).toEqual({
      kicker: "Make it yours",
      items: hints,
      truncated: false,
    });
  });

  it("caps items at DEFAULT_STYLE_HINT_LIMIT and marks truncated", () => {
    const hints = ["a", "b", "c", "d", "e"];
    const result = describeDreamStyleHints(makeDream(hints));
    expect(result).toEqual({
      kicker: "Make it yours",
      items: ["a", "b", "c"],
      truncated: true,
    });
    expect(DEFAULT_STYLE_HINT_LIMIT).toBe(3);
  });

  it("respects a custom limit and surfaces truncated correctly", () => {
    const hints = ["a", "b", "c", "d"];
    const result = describeDreamStyleHints(makeDream(hints), 2);
    expect(result).toEqual({
      kicker: "Make it yours",
      items: ["a", "b"],
      truncated: true,
    });
  });

  it("treats limit 0 as unlimited", () => {
    const hints = ["a", "b", "c", "d", "e"];
    const result = describeDreamStyleHints(makeDream(hints), 0);
    expect(result).toEqual({
      kicker: "Make it yours",
      items: hints,
      truncated: false,
    });
  });

  it("trims each hint and collapses internal whitespace", () => {
    const result = describeDreamStyleHints(makeDream(["   the   color   ", "game  over  text"]));
    expect(result?.items).toEqual(["the color", "game over text"]);
  });

  it("skips empty-after-trim entries but keeps adjacent real ones", () => {
    const result = describeDreamStyleHints(makeDream(["a", "", "  ", "b", "c"]));
    expect(result?.items).toEqual(["a", "b", "c"]);
    expect(result?.truncated).toBe(false);
  });

  it("counts only non-empty hints when deciding truncation", () => {
    const result = describeDreamStyleHints(makeDream(["a", "", "b", "  ", "c"]));
    expect(result).toEqual({
      kicker: "Make it yours",
      items: ["a", "b", "c"],
      truncated: false,
    });
  });
});
