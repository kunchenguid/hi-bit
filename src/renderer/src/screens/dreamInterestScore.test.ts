import type { Dream } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { scoreDreamInterestMatch } from "./dreamInterestScore";

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
  };
}

describe("scoreDreamInterestMatch", () => {
  it("returns 0 when the profile has no interests", () => {
    expect(scoreDreamInterestMatch(makeDream(["cats", "space"]), [])).toBe(0);
  });

  it("returns 0 when profile interests are only whitespace", () => {
    expect(scoreDreamInterestMatch(makeDream(["cats"]), ["  ", "\t"])).toBe(0);
  });

  it("returns 0 when the dream has no interest_tags", () => {
    expect(scoreDreamInterestMatch(makeDream([]), ["cats"])).toBe(0);
  });

  it("returns 0 when no interests intersect", () => {
    expect(scoreDreamInterestMatch(makeDream(["space", "robots"]), ["cats"])).toBe(0);
  });

  it("counts each matching tag (case-insensitive)", () => {
    expect(
      scoreDreamInterestMatch(makeDream(["Cats", "Space", "Robots"]), ["cats", "robots", "dogs"]),
    ).toBe(2);
  });

  it("ranks dreams with more matches above dreams with fewer", () => {
    const many = makeDream(["family", "friends", "school"]);
    const few = makeDream(["family", "robots"]);
    const interests = ["family", "friends", "school"];
    expect(scoreDreamInterestMatch(many, interests)).toBeGreaterThan(
      scoreDreamInterestMatch(few, interests),
    );
  });

  it("does not double-count duplicate tags on the dream", () => {
    expect(scoreDreamInterestMatch(makeDream(["cats", "Cats", "CATS"]), ["cats"])).toBe(1);
  });

  it("ignores blank/whitespace tags in the dream list", () => {
    expect(scoreDreamInterestMatch(makeDream(["", "  ", "cats"]), ["cats"])).toBe(1);
  });

  it("matches aliases so 'piano' counts both music and keyboard tags", () => {
    expect(
      scoreDreamInterestMatch(makeDream(["music", "rhythm", "drums", "beats", "keyboard"]), [
        "piano",
      ]),
    ).toBe(2);
  });

  it("treats 'ski' as a sports synonym so a dream tagged sports matches", () => {
    expect(scoreDreamInterestMatch(makeDream(["time", "numbers", "sports"]), ["ski"])).toBe(1);
  });

  it("does not let an alias dilute scoring when the dream already had a direct match", () => {
    expect(scoreDreamInterestMatch(makeDream(["music"]), ["piano", "music"])).toBe(1);
  });
});
