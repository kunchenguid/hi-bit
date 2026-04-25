import type { DreamCategory } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import {
  countKidProjectsByCategoryFilter,
  filterKidProjectsByCategory,
  KID_PROJECTS_FILTERS,
} from "./kidProjectsFilter";
import type { KidProjectListEntry } from "./kidProjectsList";

function makeEntry(
  id: string,
  categories: readonly DreamCategory[],
  overrides: Partial<KidProjectListEntry> = {},
): KidProjectListEntry {
  return {
    dreamId: id,
    slug: id,
    title: id,
    summary: null,
    categories,
    startedAt: "2026-04-01T00:00:00.000Z",
    lastActiveAt: "2026-04-10T00:00:00.000Z",
    isCurrent: false,
    ...overrides,
  };
}

describe("filterKidProjectsByCategory", () => {
  it("returns all entries when filter is 'all'", () => {
    const entries = [makeEntry("a", ["arcade"]), makeEntry("b", ["art"])];
    expect(filterKidProjectsByCategory(entries, "all")).toEqual(entries);
  });

  it("preserves order when filter is 'all'", () => {
    const entries = [makeEntry("z", ["arcade"]), makeEntry("a", ["art"])];
    expect(filterKidProjectsByCategory(entries, "all").map((e) => e.dreamId)).toEqual(["z", "a"]);
  });

  it("returns only entries that include the chosen category", () => {
    const entries = [
      makeEntry("a", ["arcade"]),
      makeEntry("b", ["art"]),
      makeEntry("c", ["arcade", "creative"]),
    ];
    expect(filterKidProjectsByCategory(entries, "arcade").map((e) => e.dreamId)).toEqual([
      "a",
      "c",
    ]);
  });

  it("matches when any of an entry's categories matches the filter", () => {
    const entries = [makeEntry("multi", ["personal", "utility"])];
    expect(filterKidProjectsByCategory(entries, "utility")).toEqual(entries);
    expect(filterKidProjectsByCategory(entries, "personal")).toEqual(entries);
  });

  it("excludes entries with no categories when a specific filter is chosen", () => {
    const entries = [makeEntry("unknown", []), makeEntry("a", ["arcade"])];
    expect(filterKidProjectsByCategory(entries, "arcade").map((e) => e.dreamId)).toEqual(["a"]);
  });

  it("returns an empty list when no entry matches the filter", () => {
    const entries = [makeEntry("a", ["arcade"])];
    expect(filterKidProjectsByCategory(entries, "art")).toEqual([]);
  });

  it("returns an empty list for empty input regardless of filter", () => {
    expect(filterKidProjectsByCategory([], "all")).toEqual([]);
    expect(filterKidProjectsByCategory([], "arcade")).toEqual([]);
  });

  it("returns a new array instance so callers can mutate without affecting input", () => {
    const entries = [makeEntry("a", ["arcade"])];
    const result = filterKidProjectsByCategory(entries, "all");
    expect(result).not.toBe(entries);
    expect(result).toEqual(entries);
  });
});

describe("KID_PROJECTS_FILTERS", () => {
  it("starts with 'all' followed by every DreamCategory", () => {
    expect(KID_PROJECTS_FILTERS).toEqual([
      "all",
      "arcade",
      "creative",
      "personal",
      "utility",
      "art",
    ]);
  });
});

describe("countKidProjectsByCategoryFilter", () => {
  it("returns zero for every key when input is empty", () => {
    expect(countKidProjectsByCategoryFilter([])).toEqual({
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
    expect(countKidProjectsByCategoryFilter(entries).all).toBe(3);
  });

  it("counts entries per category across the saved list", () => {
    const entries = [
      makeEntry("a", ["arcade"]),
      makeEntry("b", ["art"]),
      makeEntry("c", ["arcade"]),
    ];
    const counts = countKidProjectsByCategoryFilter(entries);
    expect(counts.arcade).toBe(2);
    expect(counts.art).toBe(1);
    expect(counts.creative).toBe(0);
    expect(counts.personal).toBe(0);
    expect(counts.utility).toBe(0);
  });

  it("counts a multi-category entry once per unique category", () => {
    const entries = [makeEntry("multi", ["arcade", "creative", "personal"])];
    const counts = countKidProjectsByCategoryFilter(entries);
    expect(counts.all).toBe(1);
    expect(counts.arcade).toBe(1);
    expect(counts.creative).toBe(1);
    expect(counts.personal).toBe(1);
    expect(counts.utility).toBe(0);
    expect(counts.art).toBe(0);
  });

  it("dedupes a duplicated category within one entry so it only counts once", () => {
    const entries = [makeEntry("dup", ["arcade", "arcade"] as unknown as readonly DreamCategory[])];
    const counts = countKidProjectsByCategoryFilter(entries);
    expect(counts.arcade).toBe(1);
  });

  it("does not mutate the input entries", () => {
    const entries = [makeEntry("a", ["arcade", "creative"])];
    const snapshot = JSON.stringify(entries);
    countKidProjectsByCategoryFilter(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it("returns zero for all category keys when every entry has no categories", () => {
    const entries = [makeEntry("orphan", [])];
    const counts = countKidProjectsByCategoryFilter(entries);
    expect(counts.all).toBe(1);
    expect(counts.arcade).toBe(0);
    expect(counts.creative).toBe(0);
    expect(counts.personal).toBe(0);
    expect(counts.utility).toBe(0);
    expect(counts.art).toBe(0);
  });
});
