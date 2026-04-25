import { describe, expect, it } from "vitest";
import type { ParentProjectRow } from "./parentProjectRows";
import {
  normalizeParentProjectsSearchQuery,
  searchParentProjectsByText,
} from "./parentProjectsSearch";

function makeRow(overrides: Partial<ParentProjectRow> = {}): ParentProjectRow {
  return {
    slug: overrides.slug ?? "snake",
    dreamId: overrides.dreamId ?? "snake",
    title: overrides.title ?? "Snake",
    startedAt: overrides.startedAt ?? "2026-04-20T08:00:00.000Z",
    lastActiveAt: overrides.lastActiveAt ?? "2026-04-20T08:00:00.000Z",
    isCurrent: overrides.isCurrent ?? false,
    isKnown: overrides.isKnown ?? true,
  };
}

describe("normalizeParentProjectsSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeParentProjectsSearchQuery("  Pet  Page  ")).toBe("pet page");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeParentProjectsSearchQuery("")).toBe("");
    expect(normalizeParentProjectsSearchQuery("   ")).toBe("");
    expect(normalizeParentProjectsSearchQuery("\t\n")).toBe("");
  });
});

describe("searchParentProjectsByText", () => {
  it("returns all rows unchanged when query is blank", () => {
    const rows = [makeRow({ slug: "a" }), makeRow({ slug: "b" })];
    expect(searchParentProjectsByText(rows, "")).toEqual(rows);
    expect(searchParentProjectsByText(rows, "   ")).toEqual(rows);
  });

  it("returns a new array instance when query is blank (not the same reference)", () => {
    const rows = [makeRow({ slug: "a" })];
    expect(searchParentProjectsByText(rows, "")).not.toBe(rows);
  });

  it("preserves input order when query is blank", () => {
    const rows = [makeRow({ slug: "z" }), makeRow({ slug: "a" })];
    expect(searchParentProjectsByText(rows, "").map((r) => r.slug)).toEqual(["z", "a"]);
  });

  it("matches the title case-insensitively", () => {
    const rows = [
      makeRow({ slug: "s", dreamId: "s-id", title: "Snake" }),
      makeRow({ slug: "p", dreamId: "p-id", title: "Pet Page" }),
    ];
    expect(searchParentProjectsByText(rows, "SNAKE").map((r) => r.slug)).toEqual(["s"]);
    expect(searchParentProjectsByText(rows, "pet").map((r) => r.slug)).toEqual(["p"]);
  });

  it("matches the slug", () => {
    const rows = [
      makeRow({ slug: "snake", dreamId: "s-id", title: "One" }),
      makeRow({ slug: "pong", dreamId: "p-id", title: "Two" }),
    ];
    expect(searchParentProjectsByText(rows, "pong").map((r) => r.slug)).toEqual(["pong"]);
  });

  it("matches the dreamId", () => {
    const rows = [
      makeRow({ slug: "s-1", dreamId: "snake", title: "Snake" }),
      makeRow({ slug: "p-1", dreamId: "pong", title: "Pong" }),
    ];
    expect(searchParentProjectsByText(rows, "snake").map((r) => r.slug)).toEqual(["s-1"]);
  });

  it("tolerates a null dreamId in the haystack", () => {
    const rows = [
      makeRow({ slug: "orphan-1", dreamId: null, title: "Lost project" }),
      makeRow({ slug: "s-1", dreamId: "snake", title: "Snake" }),
    ];
    expect(searchParentProjectsByText(rows, "lost").map((r) => r.slug)).toEqual(["orphan-1"]);
    expect(searchParentProjectsByText(rows, "orphan").map((r) => r.slug)).toEqual(["orphan-1"]);
  });

  it("treats multi-word queries as AND across tokens (mixing fields)", () => {
    const rows = [
      makeRow({ slug: "s", dreamId: "snake", title: "Snake" }),
      makeRow({ slug: "p", dreamId: "pong", title: "Pong" }),
      makeRow({ slug: "s-remix", dreamId: "snake", title: "Snake Remix" }),
    ];
    expect(searchParentProjectsByText(rows, "snake remix").map((r) => r.slug)).toEqual(["s-remix"]);
  });

  it("returns an empty list when nothing matches", () => {
    const rows = [makeRow({ slug: "s", title: "Snake" })];
    expect(searchParentProjectsByText(rows, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchParentProjectsByText([], "")).toEqual([]);
    expect(searchParentProjectsByText([], "snake")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const rows = [
      makeRow({ slug: "s1", title: "Snake one" }),
      makeRow({ slug: "s2", title: "Snake two" }),
    ];
    expect(searchParentProjectsByText(rows, "snake").map((r) => r.slug)).toEqual(["s1", "s2"]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const rows = [makeRow({ slug: "s", dreamId: "snake", title: "Snake Remix" })];
    expect(searchParentProjectsByText(rows, "  snake   remix  ").map((r) => r.slug)).toEqual(["s"]);
  });

  it("does not mutate its input", () => {
    const rows = [makeRow({ slug: "a" }), makeRow({ slug: "b" })];
    const snapshot = rows.map((r) => ({ ...r }));
    searchParentProjectsByText(rows, "a");
    expect(rows).toEqual(snapshot);
  });
});
