import type { Dream, DreamCategory } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { countDreamsByCategoryFilter, DREAM_FILTERS, filterDreamsByCategory } from "./dreamFilter";

function makeDream(id: string, categories: DreamCategory[]): Dream {
  return {
    id,
    title_parent: id,
    title_kid: id,
    summary_kid: id,
    categories,
    interest_tags: [],
    requires: [],
    style_hints: [],
    emoji: "✨",
    difficulty: 1,
  };
}

describe("filterDreamsByCategory", () => {
  it("returns all dreams when filter is 'all'", () => {
    const dreams = [makeDream("a", ["arcade"]), makeDream("b", ["art"])];
    expect(filterDreamsByCategory(dreams, "all")).toEqual(dreams);
  });

  it("preserves order when filter is 'all'", () => {
    const dreams = [makeDream("z", ["arcade"]), makeDream("a", ["art"])];
    expect(filterDreamsByCategory(dreams, "all").map((d) => d.id)).toEqual(["z", "a"]);
  });

  it("returns only dreams that include the chosen category", () => {
    const dreams = [
      makeDream("a", ["arcade"]),
      makeDream("b", ["art"]),
      makeDream("c", ["arcade", "creative"]),
    ];
    expect(filterDreamsByCategory(dreams, "arcade").map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("matches when any of a dream's categories matches the filter", () => {
    const dreams = [makeDream("multi", ["personal", "utility"])];
    expect(filterDreamsByCategory(dreams, "utility")).toEqual(dreams);
    expect(filterDreamsByCategory(dreams, "personal")).toEqual(dreams);
  });

  it("returns an empty list when no dream matches the filter", () => {
    const dreams = [makeDream("a", ["arcade"])];
    expect(filterDreamsByCategory(dreams, "art")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of filter", () => {
    expect(filterDreamsByCategory([], "all")).toEqual([]);
    expect(filterDreamsByCategory([], "arcade")).toEqual([]);
  });
});

describe("DREAM_FILTERS", () => {
  it("starts with 'all' followed by every DreamCategory", () => {
    expect(DREAM_FILTERS).toEqual(["all", "arcade", "creative", "personal", "utility", "art"]);
  });
});

describe("countDreamsByCategoryFilter", () => {
  it("returns zeroes for every filter on an empty input", () => {
    expect(countDreamsByCategoryFilter([])).toEqual({
      all: 0,
      arcade: 0,
      creative: 0,
      personal: 0,
      utility: 0,
      art: 0,
    });
  });

  it("counts 'all' as the dream list length", () => {
    const dreams = [
      makeDream("a", ["arcade"]),
      makeDream("b", ["art"]),
      makeDream("c", ["creative"]),
    ];
    expect(countDreamsByCategoryFilter(dreams).all).toBe(3);
  });

  it("counts each category by membership across dreams", () => {
    const dreams = [
      makeDream("a", ["arcade"]),
      makeDream("b", ["arcade", "creative"]),
      makeDream("c", ["art"]),
    ];
    const counts = countDreamsByCategoryFilter(dreams);
    expect(counts.arcade).toBe(2);
    expect(counts.creative).toBe(1);
    expect(counts.art).toBe(1);
    expect(counts.personal).toBe(0);
    expect(counts.utility).toBe(0);
  });

  it("counts a multi-category dream in each of its categories", () => {
    const dreams = [makeDream("multi", ["personal", "utility", "creative"])];
    const counts = countDreamsByCategoryFilter(dreams);
    expect(counts.all).toBe(1);
    expect(counts.personal).toBe(1);
    expect(counts.utility).toBe(1);
    expect(counts.creative).toBe(1);
    expect(counts.arcade).toBe(0);
    expect(counts.art).toBe(0);
  });

  it("does not double-count duplicate categories on the same dream", () => {
    const dreams = [makeDream("dup", ["arcade", "arcade"])];
    const counts = countDreamsByCategoryFilter(dreams);
    expect(counts.all).toBe(1);
    expect(counts.arcade).toBe(1);
  });

  it("does not mutate the input list", () => {
    const dreams = [makeDream("a", ["arcade"]), makeDream("b", ["art"])];
    const snapshot = JSON.parse(JSON.stringify(dreams));
    countDreamsByCategoryFilter(dreams);
    expect(dreams).toEqual(snapshot);
  });
});
