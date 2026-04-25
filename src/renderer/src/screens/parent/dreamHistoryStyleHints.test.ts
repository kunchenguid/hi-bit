import type { Dream, DreamLibrary } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import type { DreamHistoryEntry } from "./dreamHistoryList";
import { describeDreamHistoryStyleHints } from "./dreamHistoryStyleHints";

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

describe("describeDreamHistoryStyleHints", () => {
  it("returns null when entry is null", () => {
    const library = makeLibrary(makeDream("snake", { style_hints: ["colorful"] }));
    expect(describeDreamHistoryStyleHints(null, library)).toBeNull();
  });

  it("returns null when entry is undefined", () => {
    const library = makeLibrary(makeDream("snake", { style_hints: ["colorful"] }));
    expect(describeDreamHistoryStyleHints(undefined, library)).toBeNull();
  });

  it("returns null when the library is null", () => {
    expect(describeDreamHistoryStyleHints(makeEntry(), null)).toBeNull();
  });

  it("returns null when the dream is not in the library (orphaned)", () => {
    const library = makeLibrary(makeDream("pet-page", { style_hints: ["cute"] }));
    expect(describeDreamHistoryStyleHints(makeEntry({ dreamId: "snake" }), library)).toBeNull();
  });

  it("returns null when style_hints is empty", () => {
    const library = makeLibrary(makeDream("snake", { style_hints: [] }));
    expect(describeDreamHistoryStyleHints(makeEntry(), library)).toBeNull();
  });

  it("returns null when style_hints contains only whitespace entries", () => {
    const library = makeLibrary(makeDream("snake", { style_hints: ["", "   ", "\t\n"] }));
    expect(describeDreamHistoryStyleHints(makeEntry(), library)).toBeNull();
  });

  it("returns trimmed hints in author-declared order", () => {
    const library = makeLibrary(
      makeDream("snake", { style_hints: ["  colorful ", "playful", " retro "] }),
    );
    expect(describeDreamHistoryStyleHints(makeEntry(), library)).toEqual([
      "colorful",
      "playful",
      "retro",
    ]);
  });

  it("collapses internal whitespace inside each hint", () => {
    const library = makeLibrary(
      makeDream("snake", { style_hints: ["bold\n\nand\tbright", "retro  vibes"] }),
    );
    expect(describeDreamHistoryStyleHints(makeEntry(), library)).toEqual([
      "bold and bright",
      "retro vibes",
    ]);
  });

  it("dedupes case-insensitively, preserving first-seen form", () => {
    const library = makeLibrary(
      makeDream("snake", { style_hints: ["Colorful", "colorful", "PLAYFUL", "playful"] }),
    );
    expect(describeDreamHistoryStyleHints(makeEntry(), library)).toEqual(["Colorful", "PLAYFUL"]);
  });

  it("skips non-string entries without throwing", () => {
    const library = makeLibrary(
      makeDream("snake", {
        style_hints: ["colorful", null as unknown as string, 42 as unknown as string, "retro"],
      }),
    );
    expect(describeDreamHistoryStyleHints(makeEntry(), library)).toEqual(["colorful", "retro"]);
  });

  it("works independently of isCurrent / isKnown flags", () => {
    const library = makeLibrary(makeDream("snake", { style_hints: ["colorful"] }));
    const entry = makeEntry({ isCurrent: true, isKnown: true });
    expect(describeDreamHistoryStyleHints(entry, library)).toEqual(["colorful"]);
  });
});
