import type { DreamCategory } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import {
  countDreamHistoryByCategoryFilter,
  DREAM_HISTORY_FILTERS,
  filterDreamHistoryByCategory,
} from "./dreamHistoryFilter";
import type { DreamHistoryEntry } from "./dreamHistoryList";

function makeEntry(
  id: string,
  categories: readonly DreamCategory[],
  overrides: Partial<DreamHistoryEntry> = {},
): DreamHistoryEntry {
  return {
    dreamId: id,
    title: id,
    categories,
    isCurrent: false,
    isKnown: categories.length > 0,
    ...overrides,
  };
}

describe("DREAM_HISTORY_FILTERS", () => {
  it("starts with 'all' followed by every DreamCategory", () => {
    expect(DREAM_HISTORY_FILTERS).toEqual([
      "all",
      "arcade",
      "creative",
      "personal",
      "utility",
      "art",
    ]);
  });
});

describe("filterDreamHistoryByCategory", () => {
  it("returns all entries when filter is 'all'", () => {
    const entries = [makeEntry("a", ["arcade"]), makeEntry("b", ["art"])];
    expect(filterDreamHistoryByCategory(entries, "all")).toEqual(entries);
  });

  it("preserves order when filter is 'all'", () => {
    const entries = [makeEntry("z", ["arcade"]), makeEntry("a", ["art"])];
    expect(filterDreamHistoryByCategory(entries, "all").map((e) => e.dreamId)).toEqual(["z", "a"]);
  });

  it("returns only entries that include the chosen category", () => {
    const entries = [
      makeEntry("a", ["arcade"]),
      makeEntry("b", ["art"]),
      makeEntry("c", ["arcade", "creative"]),
    ];
    expect(filterDreamHistoryByCategory(entries, "arcade").map((e) => e.dreamId)).toEqual([
      "a",
      "c",
    ]);
  });

  it("matches when any of an entry's categories matches the filter", () => {
    const entries = [makeEntry("multi", ["personal", "utility"])];
    expect(filterDreamHistoryByCategory(entries, "utility")).toEqual(entries);
    expect(filterDreamHistoryByCategory(entries, "personal")).toEqual(entries);
  });

  it("excludes orphan entries (empty categories) when a specific filter is chosen", () => {
    const entries = [makeEntry("ghost", []), makeEntry("a", ["arcade"])];
    expect(filterDreamHistoryByCategory(entries, "arcade").map((e) => e.dreamId)).toEqual(["a"]);
  });

  it("returns an empty list when no entry matches the filter", () => {
    const entries = [makeEntry("a", ["arcade"])];
    expect(filterDreamHistoryByCategory(entries, "art")).toEqual([]);
  });

  it("returns an empty list for empty input regardless of filter", () => {
    expect(filterDreamHistoryByCategory([], "all")).toEqual([]);
    expect(filterDreamHistoryByCategory([], "arcade")).toEqual([]);
  });

  it("returns a new array instance so callers can mutate without affecting input", () => {
    const entries = [makeEntry("a", ["arcade"])];
    const result = filterDreamHistoryByCategory(entries, "all");
    expect(result).not.toBe(entries);
    expect(result).toEqual(entries);
  });
});

describe("countDreamHistoryByCategoryFilter", () => {
  it("returns zero for every key when input is empty", () => {
    expect(countDreamHistoryByCategoryFilter([])).toEqual({
      all: 0,
      arcade: 0,
      creative: 0,
      personal: 0,
      utility: 0,
      art: 0,
    });
  });

  it("reports the entry count for 'all'", () => {
    const entries = [
      makeEntry("a", ["arcade"]),
      makeEntry("b", ["art"]),
      makeEntry("c", ["personal"]),
    ];
    expect(countDreamHistoryByCategoryFilter(entries).all).toBe(3);
  });

  it("counts entries per category across the history list", () => {
    const entries = [
      makeEntry("a", ["arcade"]),
      makeEntry("b", ["art"]),
      makeEntry("c", ["arcade"]),
    ];
    const counts = countDreamHistoryByCategoryFilter(entries);
    expect(counts.arcade).toBe(2);
    expect(counts.art).toBe(1);
    expect(counts.creative).toBe(0);
    expect(counts.personal).toBe(0);
    expect(counts.utility).toBe(0);
  });

  it("counts a multi-category entry once per unique category", () => {
    const entries = [makeEntry("multi", ["arcade", "creative", "personal"])];
    const counts = countDreamHistoryByCategoryFilter(entries);
    expect(counts.all).toBe(1);
    expect(counts.arcade).toBe(1);
    expect(counts.creative).toBe(1);
    expect(counts.personal).toBe(1);
    expect(counts.utility).toBe(0);
    expect(counts.art).toBe(0);
  });

  it("dedupes a duplicated category within one entry so it only counts once", () => {
    const entries = [makeEntry("dup", ["arcade", "arcade"] as unknown as readonly DreamCategory[])];
    const counts = countDreamHistoryByCategoryFilter(entries);
    expect(counts.arcade).toBe(1);
  });

  it("does not mutate the input entries", () => {
    const entries = [makeEntry("a", ["arcade", "creative"])];
    const snapshot = JSON.stringify(entries);
    countDreamHistoryByCategoryFilter(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it("counts orphan entries (empty categories) only toward 'all'", () => {
    const entries = [makeEntry("ghost", []), makeEntry("a", ["arcade"])];
    const counts = countDreamHistoryByCategoryFilter(entries);
    expect(counts.all).toBe(2);
    expect(counts.arcade).toBe(1);
    expect(counts.art).toBe(0);
  });
});
