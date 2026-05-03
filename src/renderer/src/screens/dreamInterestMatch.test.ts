import type { Dream } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { DEFAULT_INTEREST_MATCH_LIMIT, describeDreamInterestMatch } from "./dreamInterestMatch";

function makeDream(interest_tags: string[]): Dream {
  return {
    id: "d1",
    title_parent: "d1",
    title_kid: "d1",
    summary_kid: "d1",
    categories: ["arcade"],
    interest_tags,
    requires: [],
    style_hints: [],
    emoji: "✨",
    difficulty: 1,
  };
}

describe("describeDreamInterestMatch", () => {
  it("returns null when the profile has no interests", () => {
    expect(describeDreamInterestMatch(makeDream(["cats", "space"]), [])).toBeNull();
  });

  it("returns null when profile interests are only whitespace", () => {
    expect(describeDreamInterestMatch(makeDream(["cats"]), ["  ", "\t"])).toBeNull();
  });

  it("returns null when the dream has no interest_tags", () => {
    expect(describeDreamInterestMatch(makeDream([]), ["cats"])).toBeNull();
  });

  it("returns null when no interests intersect", () => {
    expect(describeDreamInterestMatch(makeDream(["space", "robots"]), ["cats"])).toBeNull();
  });

  it("returns matched tags (case insensitive) with For-you kicker", () => {
    const result = describeDreamInterestMatch(makeDream(["Cats", "Space"]), ["cats", "dogs"]);
    expect(result).toEqual({ kicker: "For you", tags: ["Cats"], truncated: false });
  });

  it("preserves original dream-tag casing in the result", () => {
    const result = describeDreamInterestMatch(makeDream(["Rhythm Games"]), ["RHYTHM GAMES"]);
    expect(result?.tags).toEqual(["Rhythm Games"]);
  });

  it("returns multiple matches in dream-declared order", () => {
    const result = describeDreamInterestMatch(makeDream(["dinosaurs", "space", "cats"]), [
      "cats",
      "space",
      "dinosaurs",
    ]);
    expect(result?.tags).toEqual(["dinosaurs", "space", "cats"]);
    expect(result?.truncated).toBe(false);
  });

  it("caps matches at DEFAULT_INTEREST_MATCH_LIMIT and marks truncated", () => {
    const dream = makeDream(["a", "b", "c", "d", "e"]);
    const result = describeDreamInterestMatch(dream, ["a", "b", "c", "d", "e"]);
    expect(result).toEqual({ kicker: "For you", tags: ["a", "b", "c"], truncated: true });
    expect(DEFAULT_INTEREST_MATCH_LIMIT).toBe(3);
  });

  it("respects a custom limit", () => {
    const result = describeDreamInterestMatch(makeDream(["a", "b", "c"]), ["a", "b", "c"], 2);
    expect(result).toEqual({ kicker: "For you", tags: ["a", "b"], truncated: true });
  });

  it("treats limit 0 as unlimited", () => {
    const result = describeDreamInterestMatch(
      makeDream(["a", "b", "c", "d", "e"]),
      ["a", "b", "c", "d", "e"],
      0,
    );
    expect(result?.tags).toEqual(["a", "b", "c", "d", "e"]);
    expect(result?.truncated).toBe(false);
  });

  it("deduplicates repeated dream tags (case insensitive)", () => {
    const result = describeDreamInterestMatch(makeDream(["cats", "Cats", "cats"]), ["cats"]);
    expect(result?.tags).toEqual(["cats"]);
    expect(result?.truncated).toBe(false);
  });

  it("skips whitespace-only dream tags without affecting truncation", () => {
    const result = describeDreamInterestMatch(makeDream(["cats", "  ", "", "space"]), [
      "cats",
      "space",
    ]);
    expect(result?.tags).toEqual(["cats", "space"]);
    expect(result?.truncated).toBe(false);
  });

  it("trims profile-interest whitespace before matching", () => {
    const result = describeDreamInterestMatch(makeDream(["cats"]), ["   cats   "]);
    expect(result?.tags).toEqual(["cats"]);
  });
});
