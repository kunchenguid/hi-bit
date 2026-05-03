import type { Dream, DreamLibrary } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { describeDreamHistoryInterests } from "./dreamHistoryInterests";
import type { DreamHistoryEntry } from "./dreamHistoryList";

function makeDream(id: string, overrides: Partial<Dream> = {}): Dream {
  return {
    id,
    title_parent: overrides.title_parent ?? id,
    title_kid: overrides.title_kid ?? id,
    summary_kid: overrides.summary_kid ?? "A fun project",
    categories: overrides.categories ?? ["arcade"],
    interest_tags: overrides.interest_tags ?? [],
    requires: overrides.requires ?? [],
    style_hints: overrides.style_hints ?? [],
    emoji: overrides.emoji ?? "✨",
    difficulty: overrides.difficulty ?? 1,
  };
}

function makeLibrary(...dreams: Dream[]): DreamLibrary {
  const byId: Record<string, Dream> = {};
  for (const d of dreams) byId[d.id] = d;
  return { dreams, byId };
}

function makeEntry(overrides: Partial<DreamHistoryEntry> = {}): DreamHistoryEntry {
  return {
    dreamId: overrides.dreamId ?? "snake",
    title: overrides.title ?? "Snake",
    categories: overrides.categories ?? ["arcade"],
    isCurrent: overrides.isCurrent ?? false,
    isKnown: overrides.isKnown ?? true,
  };
}

describe("describeDreamHistoryInterests", () => {
  it("returns null when entry is null", () => {
    const library = makeLibrary(makeDream("snake", { interest_tags: ["games"] }));
    expect(describeDreamHistoryInterests(null, library)).toBeNull();
  });

  it("returns null when entry is undefined", () => {
    const library = makeLibrary(makeDream("snake", { interest_tags: ["games"] }));
    expect(describeDreamHistoryInterests(undefined, library)).toBeNull();
  });

  it("returns null when the library is null", () => {
    expect(describeDreamHistoryInterests(makeEntry(), null)).toBeNull();
  });

  it("returns null when the dream is not in the library (orphaned)", () => {
    const library = makeLibrary(makeDream("pet-page", { interest_tags: ["animals"] }));
    expect(describeDreamHistoryInterests(makeEntry({ dreamId: "snake" }), library)).toBeNull();
  });

  it("returns null when interest_tags is empty", () => {
    const library = makeLibrary(makeDream("snake", { interest_tags: [] }));
    expect(describeDreamHistoryInterests(makeEntry(), library)).toBeNull();
  });

  it("returns null when interest_tags contains only whitespace entries", () => {
    const library = makeLibrary(makeDream("snake", { interest_tags: ["", "   ", "\t\n"] }));
    expect(describeDreamHistoryInterests(makeEntry(), library)).toBeNull();
  });

  it("returns trimmed tags in author-declared order", () => {
    const library = makeLibrary(
      makeDream("snake", { interest_tags: ["  games ", "animals", " space "] }),
    );
    expect(describeDreamHistoryInterests(makeEntry(), library)).toEqual([
      "games",
      "animals",
      "space",
    ]);
  });

  it("dedupes case-insensitively, preserving first-seen form", () => {
    const library = makeLibrary(
      makeDream("snake", { interest_tags: ["Games", "games", "ANIMALS", "animals"] }),
    );
    expect(describeDreamHistoryInterests(makeEntry(), library)).toEqual(["Games", "ANIMALS"]);
  });

  it("skips non-string entries without throwing", () => {
    const library = makeLibrary(
      makeDream("snake", {
        interest_tags: ["games", null as unknown as string, 42 as unknown as string, "animals"],
      }),
    );
    expect(describeDreamHistoryInterests(makeEntry(), library)).toEqual(["games", "animals"]);
  });

  it("works independently of isCurrent / isKnown flags", () => {
    const library = makeLibrary(makeDream("snake", { interest_tags: ["games"] }));
    const entry = makeEntry({ isCurrent: true, isKnown: true });
    expect(describeDreamHistoryInterests(entry, library)).toEqual(["games"]);
  });
});
