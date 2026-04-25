import type { Dream } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { describeRecommendedDream, pickRecommendedDreamIds } from "./dreamPickedForYou";

function makeDream(id: string, interestTags: string[]): Dream {
  return {
    id,
    title_parent: id,
    title_kid: id,
    summary_kid: "",
    categories: ["personal"],
    interest_tags: interestTags,
    requires: [],
    style_hints: [],
    emoji: "✨",
  };
}

describe("pickRecommendedDreamIds", () => {
  it("returns an empty set when the kid is a first-timer (great-first owns this slot)", () => {
    const dreams: Dream[] = [makeDream("a", ["art"]), makeDream("b", ["art", "drawing"])];
    expect(pickRecommendedDreamIds(dreams, ["art"], true)).toEqual(new Set<string>());
  });

  it("returns an empty set when the kid has no interests", () => {
    const dreams: Dream[] = [makeDream("a", ["art"]), makeDream("b", ["drawing"])];
    expect(pickRecommendedDreamIds(dreams, [], false)).toEqual(new Set<string>());
  });

  it("returns an empty set when no dream tags match the kid's interests", () => {
    const dreams: Dream[] = [makeDream("a", ["games"]), makeDream("b", ["food"])];
    expect(pickRecommendedDreamIds(dreams, ["dragons"], false)).toEqual(new Set<string>());
  });

  it("picks the top 3 dreams by interest-match score for non-first-timers with interests", () => {
    const dreams: Dream[] = [
      makeDream("none", ["food"]),
      makeDream("one", ["art"]),
      makeDream("two", ["art", "drawing"]),
      makeDream("three", ["art", "drawing", "design"]),
      makeDream("also-three", ["art", "drawing", "design", "colors"]),
    ];
    expect(pickRecommendedDreamIds(dreams, ["art", "drawing", "design"], false)).toEqual(
      new Set(["three", "also-three", "two"]),
    );
  });

  it("breaks ties by id (alphabetical) so the pick is deterministic", () => {
    const dreams: Dream[] = [
      makeDream("zebra", ["art"]),
      makeDream("alpha", ["art"]),
      makeDream("mango", ["art"]),
      makeDream("beta", ["art"]),
    ];
    expect(pickRecommendedDreamIds(dreams, ["art"], false)).toEqual(
      new Set(["alpha", "beta", "mango"]),
    );
  });

  it("returns fewer than 3 ids when only that many dreams have any match", () => {
    const dreams: Dream[] = [makeDream("only-match", ["art"]), makeDream("no-match", ["food"])];
    expect(pickRecommendedDreamIds(dreams, ["art"], false)).toEqual(new Set(["only-match"]));
  });

  it("matches case-insensitively with the kid's free-text interests", () => {
    const dreams: Dream[] = [makeDream("a", ["Art"]), makeDream("b", ["food"])];
    expect(pickRecommendedDreamIds(dreams, ["ART"], false)).toEqual(new Set(["a"]));
  });

  it("ignores blank kid interests when scoring", () => {
    const dreams: Dream[] = [makeDream("a", ["art"]), makeDream("b", ["food"])];
    expect(pickRecommendedDreamIds(dreams, ["", "  ", "art"], false)).toEqual(new Set(["a"]));
  });
});

describe("describeRecommendedDream", () => {
  it("returns a sentence-case kid-friendly marker (not ALL CAPS)", () => {
    const d = describeRecommendedDream();
    expect(d.kicker).toBe("Picked for you");
    expect(d.text.length).toBeGreaterThan(0);
    expect(d.kicker).not.toBe(d.kicker.toUpperCase());
  });
});
