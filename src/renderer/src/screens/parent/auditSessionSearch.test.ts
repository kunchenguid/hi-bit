import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import { normalizeAuditSessionSearchQuery, searchAuditSessionsByText } from "./auditSessionSearch";

function makeEntry(overrides: Partial<HarnessInvocationLogEntry> = {}): HarnessInvocationLogEntry {
  return {
    timestamp: overrides.timestamp ?? "2026-04-20T08:00:00.000Z",
    harness: overrides.harness ?? "claude",
    role: overrides.role ?? "kid",
    sessionId: overrides.sessionId ?? "sess-abc",
    mode: overrides.mode ?? "start",
    durationMs: overrides.durationMs ?? 5000,
    exitCode: overrides.exitCode ?? 0,
    signal: overrides.signal ?? null,
  };
}

describe("normalizeAuditSessionSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeAuditSessionSearchQuery("  Kid  Claude  ")).toBe("kid claude");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeAuditSessionSearchQuery("")).toBe("");
    expect(normalizeAuditSessionSearchQuery("   ")).toBe("");
    expect(normalizeAuditSessionSearchQuery("\t\n")).toBe("");
  });
});

describe("searchAuditSessionsByText", () => {
  it("returns all entries unchanged when query is blank", () => {
    const entries = [makeEntry({ sessionId: "s1" }), makeEntry({ sessionId: "s2" })];
    expect(searchAuditSessionsByText(entries, "")).toEqual(entries);
    expect(searchAuditSessionsByText(entries, "   ")).toEqual(entries);
  });

  it("returns a new array instance when query is blank (not the same reference)", () => {
    const entries = [makeEntry({ sessionId: "s1" })];
    expect(searchAuditSessionsByText(entries, "")).not.toBe(entries);
  });

  it("preserves input order when query is blank", () => {
    const entries = [
      makeEntry({ sessionId: "z", timestamp: "2026-04-20T09:00:00.000Z" }),
      makeEntry({ sessionId: "a", timestamp: "2026-04-20T08:00:00.000Z" }),
    ];
    expect(searchAuditSessionsByText(entries, "").map((e) => e.sessionId)).toEqual(["z", "a"]);
  });

  it("matches the role case-insensitively", () => {
    const entries = [
      makeEntry({ sessionId: "k", role: "kid" }),
      makeEntry({ sessionId: "p", role: "parent" }),
    ];
    expect(searchAuditSessionsByText(entries, "parent").map((e) => e.sessionId)).toEqual(["p"]);
    expect(searchAuditSessionsByText(entries, "KID").map((e) => e.sessionId)).toEqual(["k"]);
  });

  it("matches the harness name", () => {
    const entries = [
      makeEntry({ sessionId: "c", harness: "claude" }),
      makeEntry({ sessionId: "o", harness: "codex" }),
      makeEntry({ sessionId: "op", harness: "opencode" }),
    ];
    expect(searchAuditSessionsByText(entries, "codex").map((e) => e.sessionId)).toEqual(["o"]);
    expect(searchAuditSessionsByText(entries, "claude").map((e) => e.sessionId)).toEqual(["c"]);
  });

  it("matches a session id prefix", () => {
    const entries = [makeEntry({ sessionId: "abc-123" }), makeEntry({ sessionId: "xyz-456" })];
    expect(searchAuditSessionsByText(entries, "abc").map((e) => e.sessionId)).toEqual(["abc-123"]);
  });

  it("matches a timestamp fragment (ISO)", () => {
    const entries = [
      makeEntry({ sessionId: "today", timestamp: "2026-04-23T08:00:00.000Z" }),
      makeEntry({ sessionId: "earlier", timestamp: "2026-04-20T08:00:00.000Z" }),
    ];
    expect(searchAuditSessionsByText(entries, "2026-04-23").map((e) => e.sessionId)).toEqual([
      "today",
    ]);
  });

  it("treats multi-word queries as AND across tokens (mixing fields)", () => {
    const entries = [
      makeEntry({ sessionId: "a", role: "kid", harness: "claude" }),
      makeEntry({ sessionId: "b", role: "parent", harness: "claude" }),
      makeEntry({ sessionId: "c", role: "kid", harness: "codex" }),
    ];
    expect(searchAuditSessionsByText(entries, "kid claude").map((e) => e.sessionId)).toEqual(["a"]);
  });

  it("keeps all entries for a session when any one entry matches the query", () => {
    const entries = [
      makeEntry({
        sessionId: "s1",
        role: "kid",
        harness: "claude",
        timestamp: "2026-04-20T08:00:00.000Z",
      }),
      makeEntry({
        sessionId: "s1",
        role: "kid",
        harness: "claude",
        timestamp: "2026-04-20T08:05:00.000Z",
      }),
      makeEntry({
        sessionId: "s2",
        role: "parent",
        harness: "codex",
        timestamp: "2026-04-20T09:00:00.000Z",
      }),
    ];
    const result = searchAuditSessionsByText(entries, "claude");
    expect(result.map((e) => e.sessionId)).toEqual(["s1", "s1"]);
    expect(result.length).toBe(2);
  });

  it("returns an empty list when nothing matches", () => {
    const entries = [makeEntry({ sessionId: "s1", harness: "claude" })];
    expect(searchAuditSessionsByText(entries, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchAuditSessionsByText([], "")).toEqual([]);
    expect(searchAuditSessionsByText([], "claude")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const entries = [
      makeEntry({ sessionId: "s1", harness: "claude" }),
      makeEntry({ sessionId: "s2", harness: "claude" }),
    ];
    expect(searchAuditSessionsByText(entries, "claude").map((e) => e.sessionId)).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const entries = [makeEntry({ sessionId: "s1", harness: "claude", role: "kid" })];
    expect(searchAuditSessionsByText(entries, "  kid   claude  ").map((e) => e.sessionId)).toEqual([
      "s1",
    ]);
  });

  it("does not mutate its input", () => {
    const entries = [makeEntry({ sessionId: "s1" }), makeEntry({ sessionId: "s2" })];
    const snapshot = entries.map((e) => ({ ...e }));
    searchAuditSessionsByText(entries, "s1");
    expect(entries).toEqual(snapshot);
  });
});
