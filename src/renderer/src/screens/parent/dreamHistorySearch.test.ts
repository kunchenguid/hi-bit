import type { DreamCategory } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import type { DreamHistoryEntry } from "./dreamHistoryList";
import { normalizeDreamHistorySearchQuery, searchDreamHistoryByText } from "./dreamHistorySearch";

function makeEntry(dreamId: string, overrides: Partial<DreamHistoryEntry> = {}): DreamHistoryEntry {
  return {
    dreamId,
    title: overrides.title ?? dreamId,
    categories: overrides.categories ?? (["arcade"] as DreamCategory[]),
    isCurrent: overrides.isCurrent ?? false,
    isKnown: overrides.isKnown ?? true,
  };
}

describe("normalizeDreamHistorySearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeDreamHistorySearchQuery("  Big  Snake  ")).toBe("big snake");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeDreamHistorySearchQuery("")).toBe("");
    expect(normalizeDreamHistorySearchQuery("   ")).toBe("");
    expect(normalizeDreamHistorySearchQuery("\t\n")).toBe("");
  });
});

describe("searchDreamHistoryByText", () => {
  it("returns all entries unchanged when query is blank", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    expect(searchDreamHistoryByText(entries, "")).toEqual(entries);
    expect(searchDreamHistoryByText(entries, "   ")).toEqual(entries);
  });

  it("returns a new array instance when query is blank (not the same reference)", () => {
    const entries = [makeEntry("a"), makeEntry("b")];
    expect(searchDreamHistoryByText(entries, "")).not.toBe(entries);
  });

  it("preserves input order when query is blank", () => {
    const entries = [makeEntry("z"), makeEntry("a")];
    expect(searchDreamHistoryByText(entries, "").map((e) => e.dreamId)).toEqual(["z", "a"]);
  });

  it("matches the title case-insensitively", () => {
    const entries = [
      makeEntry("snake", { title: "Snake Game" }),
      makeEntry("pet", { title: "Pet Page" }),
    ];
    expect(searchDreamHistoryByText(entries, "snake").map((e) => e.dreamId)).toEqual(["snake"]);
    expect(searchDreamHistoryByText(entries, "SNAKE").map((e) => e.dreamId)).toEqual(["snake"]);
  });

  it("matches on the dreamId", () => {
    const entries = [
      makeEntry("click-me", { title: "Click page" }),
      makeEntry("pet-page", { title: "Pet page" }),
    ];
    expect(searchDreamHistoryByText(entries, "click-me").map((e) => e.dreamId)).toEqual([
      "click-me",
    ]);
  });

  it("matches category names", () => {
    const entries = [
      makeEntry("a", { categories: ["arcade"] }),
      makeEntry("b", { categories: ["art"] }),
    ];
    expect(searchDreamHistoryByText(entries, "art").map((e) => e.dreamId)).toEqual(["b"]);
  });

  it("treats multi-word queries as AND across tokens", () => {
    const entries = [
      makeEntry("a", { title: "Snake", categories: ["arcade"] }),
      makeEntry("b", { title: "Snake charmer", categories: ["creative"] }),
      makeEntry("c", { title: "Pong", categories: ["arcade"] }),
    ];
    expect(searchDreamHistoryByText(entries, "snake arcade").map((e) => e.dreamId)).toEqual(["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    const entries = [makeEntry("a", { title: "cats" })];
    expect(searchDreamHistoryByText(entries, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchDreamHistoryByText([], "")).toEqual([]);
    expect(searchDreamHistoryByText([], "snake")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const entries = [makeEntry("z", { title: "game z" }), makeEntry("a", { title: "game a" })];
    expect(searchDreamHistoryByText(entries, "game").map((e) => e.dreamId)).toEqual(["z", "a"]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const entries = [makeEntry("a", { title: "Snake Game" })];
    expect(searchDreamHistoryByText(entries, "  snake   game  ").map((e) => e.dreamId)).toEqual([
      "a",
    ]);
  });

  it("tolerates orphan entries with empty categories", () => {
    const entries = [makeEntry("orphan", { title: "My project", categories: [] })];
    expect(searchDreamHistoryByText(entries, "project").map((e) => e.dreamId)).toEqual(["orphan"]);
    expect(searchDreamHistoryByText(entries, "arcade")).toEqual([]);
  });

  it("does not mutate its input", () => {
    const entries = [makeEntry("a", { title: "game a" }), makeEntry("b", { title: "game b" })];
    const snapshot = entries.map((e) => ({ ...e }));
    searchDreamHistoryByText(entries, "game");
    expect(entries).toEqual(snapshot);
  });
});
