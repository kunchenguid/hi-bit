import { describe, expect, it } from "vitest";
import {
  normalizeRecentSessionsSearchQuery,
  searchRecentSessionsByText,
} from "./recentSessionsSearch";
import type { RecentSessionsOverviewEntry } from "./recentSessionsSummary";

function makeRow(
  overrides: Partial<RecentSessionsOverviewEntry> = {},
): RecentSessionsOverviewEntry {
  return {
    sessionId: overrides.sessionId ?? "sess-abc",
    role: overrides.role ?? "kid",
    harness: overrides.harness ?? "claude",
    firstAt: overrides.firstAt ?? "2026-04-20T08:00:00.000Z",
    lastAt: overrides.lastAt ?? "2026-04-20T08:30:00.000Z",
    turnCount: overrides.turnCount ?? 1,
    totalDurationMs: overrides.totalDurationMs ?? 30000,
  };
}

describe("normalizeRecentSessionsSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeRecentSessionsSearchQuery("  Kid  Claude  ")).toBe("kid claude");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeRecentSessionsSearchQuery("")).toBe("");
    expect(normalizeRecentSessionsSearchQuery("   ")).toBe("");
    expect(normalizeRecentSessionsSearchQuery("\t\n")).toBe("");
  });
});

describe("searchRecentSessionsByText", () => {
  it("returns all entries unchanged when query is blank", () => {
    const entries = [makeRow({ sessionId: "s1" }), makeRow({ sessionId: "s2" })];
    expect(searchRecentSessionsByText(entries, "")).toEqual(entries);
    expect(searchRecentSessionsByText(entries, "   ")).toEqual(entries);
  });

  it("returns a new array instance when query is blank (not the same reference)", () => {
    const entries = [makeRow({ sessionId: "s1" })];
    expect(searchRecentSessionsByText(entries, "")).not.toBe(entries);
  });

  it("preserves input order when query is blank", () => {
    const entries = [
      makeRow({ sessionId: "z", lastAt: "2026-04-20T09:00:00.000Z" }),
      makeRow({ sessionId: "a", lastAt: "2026-04-20T08:00:00.000Z" }),
    ];
    expect(searchRecentSessionsByText(entries, "").map((e) => e.sessionId)).toEqual(["z", "a"]);
  });

  it("matches the role case-insensitively", () => {
    const entries = [
      makeRow({ sessionId: "k", role: "kid" }),
      makeRow({ sessionId: "p", role: "parent" }),
    ];
    expect(searchRecentSessionsByText(entries, "parent").map((e) => e.sessionId)).toEqual(["p"]);
    expect(searchRecentSessionsByText(entries, "KID").map((e) => e.sessionId)).toEqual(["k"]);
  });

  it("matches the harness name", () => {
    const entries = [
      makeRow({ sessionId: "c", harness: "claude" }),
      makeRow({ sessionId: "o", harness: "codex" }),
      makeRow({ sessionId: "op", harness: "opencode" }),
    ];
    expect(searchRecentSessionsByText(entries, "codex").map((e) => e.sessionId)).toEqual(["o"]);
    expect(searchRecentSessionsByText(entries, "claude").map((e) => e.sessionId)).toEqual(["c"]);
  });

  it("matches a session id prefix", () => {
    const entries = [makeRow({ sessionId: "abc-123" }), makeRow({ sessionId: "xyz-456" })];
    expect(searchRecentSessionsByText(entries, "abc").map((e) => e.sessionId)).toEqual(["abc-123"]);
  });

  it("matches a date fragment from firstAt or lastAt (ISO)", () => {
    const entries = [
      makeRow({
        sessionId: "today",
        firstAt: "2026-04-23T08:00:00.000Z",
        lastAt: "2026-04-23T08:30:00.000Z",
      }),
      makeRow({
        sessionId: "earlier",
        firstAt: "2026-04-20T08:00:00.000Z",
        lastAt: "2026-04-20T08:30:00.000Z",
      }),
    ];
    expect(searchRecentSessionsByText(entries, "2026-04-23").map((e) => e.sessionId)).toEqual([
      "today",
    ]);
  });

  it("treats multi-word queries as AND across tokens (mixing fields)", () => {
    const entries = [
      makeRow({ sessionId: "a", role: "kid", harness: "claude" }),
      makeRow({ sessionId: "b", role: "parent", harness: "claude" }),
      makeRow({ sessionId: "c", role: "kid", harness: "codex" }),
    ];
    expect(searchRecentSessionsByText(entries, "kid claude").map((e) => e.sessionId)).toEqual([
      "a",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    const entries = [makeRow({ sessionId: "s1", harness: "claude" })];
    expect(searchRecentSessionsByText(entries, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchRecentSessionsByText([], "")).toEqual([]);
    expect(searchRecentSessionsByText([], "claude")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const entries = [
      makeRow({ sessionId: "s1", harness: "claude" }),
      makeRow({ sessionId: "s2", harness: "claude" }),
    ];
    expect(searchRecentSessionsByText(entries, "claude").map((e) => e.sessionId)).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const entries = [makeRow({ sessionId: "s1", harness: "claude", role: "kid" })];
    expect(searchRecentSessionsByText(entries, "  kid   claude  ").map((e) => e.sessionId)).toEqual(
      ["s1"],
    );
  });

  it("does not mutate its input", () => {
    const entries = [makeRow({ sessionId: "s1" }), makeRow({ sessionId: "s2" })];
    const snapshot = entries.map((e) => ({ ...e }));
    searchRecentSessionsByText(entries, "s1");
    expect(entries).toEqual(snapshot);
  });
});
