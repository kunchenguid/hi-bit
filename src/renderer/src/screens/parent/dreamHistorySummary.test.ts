import type { Dream, DreamLibrary } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import type { DreamHistoryEntry } from "./dreamHistoryList";
import {
  DREAM_HISTORY_SUMMARY_PREVIEW_MAX_CHARS,
  describeDreamHistorySummary,
} from "./dreamHistorySummary";

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

describe("describeDreamHistorySummary", () => {
  it("returns null when entry is null", () => {
    const library = makeLibrary(makeDream("snake"));
    expect(describeDreamHistorySummary(null, library)).toBeNull();
  });

  it("returns null when entry is undefined", () => {
    const library = makeLibrary(makeDream("snake"));
    expect(describeDreamHistorySummary(undefined, library)).toBeNull();
  });

  it("returns null when the library is null", () => {
    expect(describeDreamHistorySummary(makeEntry(), null)).toBeNull();
  });

  it("returns null when the dream is not in the library (orphaned)", () => {
    const library = makeLibrary(makeDream("pet-page"));
    expect(describeDreamHistorySummary(makeEntry({ dreamId: "snake" }), library)).toBeNull();
  });

  it("returns null when summary_kid is empty", () => {
    const library = makeLibrary(makeDream("snake", { summary_kid: "" }));
    expect(describeDreamHistorySummary(makeEntry(), library)).toBeNull();
  });

  it("returns null when summary_kid is only whitespace", () => {
    const library = makeLibrary(makeDream("snake", { summary_kid: "   \n\t  " }));
    expect(describeDreamHistorySummary(makeEntry(), library)).toBeNull();
  });

  it("returns trimmed text and matching preview for short summaries", () => {
    const library = makeLibrary(
      makeDream("snake", { summary_kid: "  eat food and grow longer  " }),
    );
    expect(describeDreamHistorySummary(makeEntry(), library)).toEqual({
      text: "eat food and grow longer",
      preview: "eat food and grow longer",
    });
  });

  it("collapses newlines and extra whitespace in the preview but preserves raw text", () => {
    const library = makeLibrary(
      makeDream("snake", { summary_kid: "slither\n\n  around\n\tand   grow" }),
    );
    expect(describeDreamHistorySummary(makeEntry(), library)).toEqual({
      text: "slither\n\n  around\n\tand   grow",
      preview: "slither around and grow",
    });
  });

  it("truncates preview over the max with an ellipsis while keeping full text", () => {
    const long = "a".repeat(DREAM_HISTORY_SUMMARY_PREVIEW_MAX_CHARS + 20);
    const library = makeLibrary(makeDream("snake", { summary_kid: long }));
    const result = describeDreamHistorySummary(makeEntry(), library);
    expect(result?.text).toBe(long);
    expect(result?.preview.length).toBe(DREAM_HISTORY_SUMMARY_PREVIEW_MAX_CHARS);
    expect(result?.preview.endsWith("...")).toBe(true);
  });

  it("works independently of isCurrent / isKnown flags", () => {
    const library = makeLibrary(makeDream("snake", { summary_kid: "slither around" }));
    const entry = makeEntry({ isCurrent: true, isKnown: true });
    expect(describeDreamHistorySummary(entry, library)).toEqual({
      text: "slither around",
      preview: "slither around",
    });
  });
});
