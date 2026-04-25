import { describe, expect, it } from "vitest";
import type { ParentDirectivesOverviewEntry } from "./parentDirectivesList";
import {
  normalizeParentDirectivesSearchQuery,
  searchParentDirectivesByText,
} from "./parentDirectivesSearch";

function makeEntry(
  id: string,
  text: string,
  overrides: Partial<ParentDirectivesOverviewEntry> = {},
): ParentDirectivesOverviewEntry {
  return {
    id,
    text,
    preview: overrides.preview ?? text,
    timestamp: overrides.timestamp ?? "2026-04-20T08:00:00.000Z",
  };
}

describe("normalizeParentDirectivesSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeParentDirectivesSearchQuery("  Focus  On  Functions  ")).toBe(
      "focus on functions",
    );
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeParentDirectivesSearchQuery("")).toBe("");
    expect(normalizeParentDirectivesSearchQuery("   ")).toBe("");
    expect(normalizeParentDirectivesSearchQuery("\t\n")).toBe("");
  });
});

describe("searchParentDirectivesByText", () => {
  it("returns all entries unchanged when query is blank", () => {
    const entries = [makeEntry("a", "one"), makeEntry("b", "two")];
    expect(searchParentDirectivesByText(entries, "")).toEqual(entries);
    expect(searchParentDirectivesByText(entries, "   ")).toEqual(entries);
  });

  it("returns a new array instance when query is blank (not the same reference)", () => {
    const entries = [makeEntry("a", "one"), makeEntry("b", "two")];
    expect(searchParentDirectivesByText(entries, "")).not.toBe(entries);
  });

  it("preserves input order when query is blank", () => {
    const entries = [makeEntry("z", "z text"), makeEntry("a", "a text")];
    expect(searchParentDirectivesByText(entries, "").map((e) => e.id)).toEqual(["z", "a"]);
  });

  it("matches the text case-insensitively", () => {
    const entries = [
      makeEntry("a", "Focus on functions this week"),
      makeEntry("b", "Skip the CSS colors"),
    ];
    expect(searchParentDirectivesByText(entries, "functions").map((e) => e.id)).toEqual(["a"]);
    expect(searchParentDirectivesByText(entries, "FUNCTIONS").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches text anywhere in the directive", () => {
    const entries = [
      makeEntry("a", "She already knows CSS colors from school"),
      makeEntry("b", "Pick easier dreams this week"),
    ];
    expect(searchParentDirectivesByText(entries, "school").map((e) => e.id)).toEqual(["a"]);
  });

  it("treats multi-word queries as AND across tokens", () => {
    const entries = [
      makeEntry("a", "Focus on functions this week"),
      makeEntry("b", "This week we focus on loops"),
      makeEntry("c", "Review functions tomorrow"),
    ];
    expect(searchParentDirectivesByText(entries, "focus functions").map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    const entries = [makeEntry("a", "focus on CSS")];
    expect(searchParentDirectivesByText(entries, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchParentDirectivesByText([], "")).toEqual([]);
    expect(searchParentDirectivesByText([], "focus")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const entries = [
      makeEntry("z", "first focus directive"),
      makeEntry("a", "second focus directive"),
    ];
    expect(searchParentDirectivesByText(entries, "focus").map((e) => e.id)).toEqual(["z", "a"]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const entries = [makeEntry("a", "Focus on functions this week")];
    expect(searchParentDirectivesByText(entries, "  focus   functions  ").map((e) => e.id)).toEqual(
      ["a"],
    );
  });

  it("matches across newline-collapsed text (search by full text not preview)", () => {
    const entries = [
      makeEntry("a", "Line one\nLine two with snake", {
        preview: "Line one Line two with snake",
      }),
    ];
    expect(searchParentDirectivesByText(entries, "snake").map((e) => e.id)).toEqual(["a"]);
  });

  it("does not mutate its input", () => {
    const entries = [makeEntry("a", "one"), makeEntry("b", "two")];
    const snapshot = entries.map((e) => ({ ...e }));
    searchParentDirectivesByText(entries, "one");
    expect(entries).toEqual(snapshot);
  });
});
