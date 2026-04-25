import { describe, expect, it } from "vitest";
import {
  isDreamPickerCollapsible,
  mergeRecommendedDreamIds,
  pickFallbackRecommendedIds,
} from "./dreamPickerCollapse";

describe("mergeRecommendedDreamIds", () => {
  it("returns an empty set when both inputs are empty", () => {
    expect(mergeRecommendedDreamIds(new Set(), new Set())).toEqual(new Set<string>());
  });

  it("returns just great-first picks when there are no picked-for-you matches", () => {
    expect(mergeRecommendedDreamIds(new Set(["a", "b"]), new Set())).toEqual(new Set(["a", "b"]));
  });

  it("returns just picked-for-you when there are no great-first picks", () => {
    expect(mergeRecommendedDreamIds(new Set(), new Set(["x", "y"]))).toEqual(new Set(["x", "y"]));
  });

  it("unions both sets without duplicates", () => {
    expect(mergeRecommendedDreamIds(new Set(["a", "b"]), new Set(["b", "c"]))).toEqual(
      new Set(["a", "b", "c"]),
    );
  });
});

describe("isDreamPickerCollapsible", () => {
  it("is collapsible when the kid is on 'all' with no query and there are recommendations", () => {
    expect(
      isDreamPickerCollapsible({
        filter: "all",
        query: "",
        recommendedDreamIds: new Set(["a", "b"]),
      }),
    ).toBe(true);
  });

  it("is not collapsible when there are no recommendations (avoid hiding the only path)", () => {
    expect(
      isDreamPickerCollapsible({
        filter: "all",
        query: "",
        recommendedDreamIds: new Set<string>(),
      }),
    ).toBe(false);
  });

  it("is not collapsible when a category filter is selected (kid is intentionally browsing)", () => {
    expect(
      isDreamPickerCollapsible({
        filter: "arcade",
        query: "",
        recommendedDreamIds: new Set(["a"]),
      }),
    ).toBe(false);
  });

  it("is not collapsible when there is a search query (kid is intentionally searching)", () => {
    expect(
      isDreamPickerCollapsible({
        filter: "all",
        query: "snake",
        recommendedDreamIds: new Set(["a"]),
      }),
    ).toBe(false);
  });

  it("treats whitespace-only queries as empty so collapsibility still applies", () => {
    expect(
      isDreamPickerCollapsible({
        filter: "all",
        query: "   ",
        recommendedDreamIds: new Set(["a"]),
      }),
    ).toBe(true);
  });
});

describe("pickFallbackRecommendedIds", () => {
  it("returns an empty set for first-timers (they already get great-first picks)", () => {
    expect(
      pickFallbackRecommendedIds({
        isFirstTimer: true,
        recommendedDreamIds: new Set<string>(),
        greatFirstDreamIds: new Set(["a", "b"]),
      }),
    ).toEqual(new Set<string>());
  });

  it("returns an empty set when the non-first-timer already has interest matches", () => {
    expect(
      pickFallbackRecommendedIds({
        isFirstTimer: false,
        recommendedDreamIds: new Set(["x", "y"]),
        greatFirstDreamIds: new Set(["a", "b"]),
      }),
    ).toEqual(new Set<string>());
  });

  it("falls back to great-first picks for non-first-timers with no interest matches", () => {
    expect(
      pickFallbackRecommendedIds({
        isFirstTimer: false,
        recommendedDreamIds: new Set<string>(),
        greatFirstDreamIds: new Set(["a", "b", "c"]),
      }),
    ).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns an empty set when great-first picks are also empty (no safety net available)", () => {
    expect(
      pickFallbackRecommendedIds({
        isFirstTimer: false,
        recommendedDreamIds: new Set<string>(),
        greatFirstDreamIds: new Set<string>(),
      }),
    ).toEqual(new Set<string>());
  });
});
