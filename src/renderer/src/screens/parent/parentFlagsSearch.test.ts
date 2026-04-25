import type { ParentFlag } from "@shared/flag";
import { describe, expect, it } from "vitest";
import type { ParentFlagOverviewEntry } from "./parentFlagsList";
import { normalizeParentFlagsSearchQuery, searchParentFlagsByText } from "./parentFlagsSearch";

function makeFlag(overrides: Partial<ParentFlag> = {}): ParentFlag {
  return {
    flaggedAt: overrides.flaggedAt ?? "2026-04-20T08:00:00.000Z",
    sessionId: overrides.sessionId ?? "sess-1",
    messageTimestamp: overrides.messageTimestamp ?? "2026-04-20T07:59:00.000Z",
    messageRole: overrides.messageRole ?? "kid",
    messageKind: overrides.messageKind ?? "assistant_message",
    messageText: overrides.messageText ?? "default message",
    reason: overrides.reason ?? "default reason",
  };
}

function makeEntry(
  flagOverrides: Partial<ParentFlag> = {},
  entryOverrides: Partial<ParentFlagOverviewEntry> = {},
): ParentFlagOverviewEntry {
  const flag = makeFlag(flagOverrides);
  return {
    flag,
    speakerLabel: entryOverrides.speakerLabel ?? "Bit said",
    preview: entryOverrides.preview ?? flag.messageText,
  };
}

describe("normalizeParentFlagsSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeParentFlagsSearchQuery("  Skip  The  Praise  ")).toBe("skip the praise");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeParentFlagsSearchQuery("")).toBe("");
    expect(normalizeParentFlagsSearchQuery("   ")).toBe("");
    expect(normalizeParentFlagsSearchQuery("\t\n")).toBe("");
  });
});

describe("searchParentFlagsByText", () => {
  it("returns all entries unchanged when query is blank", () => {
    const entries = [makeEntry({ messageText: "one" }), makeEntry({ messageText: "two" })];
    expect(searchParentFlagsByText(entries, "")).toEqual(entries);
    expect(searchParentFlagsByText(entries, "   ")).toEqual(entries);
  });

  it("returns a new array instance when query is blank (not the same reference)", () => {
    const entries = [makeEntry({ messageText: "one" })];
    expect(searchParentFlagsByText(entries, "")).not.toBe(entries);
  });

  it("preserves input order when query is blank", () => {
    const entries = [
      makeEntry({ messageText: "z", flaggedAt: "2026-04-20T09:00:00.000Z" }),
      makeEntry({ messageText: "a", flaggedAt: "2026-04-20T08:00:00.000Z" }),
    ];
    expect(searchParentFlagsByText(entries, "").map((e) => e.flag.messageText)).toEqual(["z", "a"]);
  });

  it("matches the messageText case-insensitively", () => {
    const entries = [
      makeEntry({ messageText: "Great job! You're amazing!" }),
      makeEntry({ messageText: "Let's try the next step." }),
    ];
    expect(searchParentFlagsByText(entries, "amazing").map((e) => e.flag.messageText)).toEqual([
      "Great job! You're amazing!",
    ]);
    expect(searchParentFlagsByText(entries, "AMAZING").map((e) => e.flag.messageText)).toEqual([
      "Great job! You're amazing!",
    ]);
  });

  it("matches the reason field", () => {
    const entries = [
      makeEntry({ reason: "too much empty praise" }, { preview: "hello" }),
      makeEntry({ reason: "wrote code instead of teaching" }, { preview: "hi" }),
    ];
    expect(searchParentFlagsByText(entries, "praise").map((e) => e.flag.reason)).toEqual([
      "too much empty praise",
    ]);
  });

  it("matches the speaker label", () => {
    const entries = [
      makeEntry({}, { speakerLabel: "Bit said" }),
      makeEntry({}, { speakerLabel: "Kid said" }),
      makeEntry({}, { speakerLabel: "Parent said" }),
    ];
    expect(searchParentFlagsByText(entries, "parent").map((e) => e.speakerLabel)).toEqual([
      "Parent said",
    ]);
  });

  it("treats multi-word queries as AND across tokens (mixing fields)", () => {
    const entries = [
      makeEntry({ messageText: "You're doing great", reason: "empty praise" }),
      makeEntry({ messageText: "Great work", reason: "unrelated" }),
      makeEntry({ messageText: "Nothing to flag here", reason: "empty" }),
    ];
    expect(searchParentFlagsByText(entries, "great empty").map((e) => e.flag.messageText)).toEqual([
      "You're doing great",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    const entries = [makeEntry({ messageText: "focus on CSS" })];
    expect(searchParentFlagsByText(entries, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchParentFlagsByText([], "")).toEqual([]);
    expect(searchParentFlagsByText([], "praise")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const entries = [
      makeEntry({ messageText: "first praise item" }),
      makeEntry({ messageText: "second praise item" }),
    ];
    expect(searchParentFlagsByText(entries, "praise").map((e) => e.flag.messageText)).toEqual([
      "first praise item",
      "second praise item",
    ]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const entries = [makeEntry({ messageText: "focus on functions this week" })];
    expect(
      searchParentFlagsByText(entries, "  focus   functions  ").map((e) => e.flag.messageText),
    ).toEqual(["focus on functions this week"]);
  });

  it("matches across newline-preserved messageText (search by full text not preview)", () => {
    const entries = [
      makeEntry(
        { messageText: "Line one\nLine two with snake" },
        { preview: "Line one Line two with snake" },
      ),
    ];
    expect(searchParentFlagsByText(entries, "snake").map((e) => e.flag.messageText)).toEqual([
      "Line one\nLine two with snake",
    ]);
  });

  it("does not mutate its input", () => {
    const entries = [makeEntry({ messageText: "one" }), makeEntry({ messageText: "two" })];
    const snapshot = entries.map((e) => ({
      ...e,
      flag: { ...e.flag },
    }));
    searchParentFlagsByText(entries, "one");
    expect(entries).toEqual(snapshot);
  });
});
