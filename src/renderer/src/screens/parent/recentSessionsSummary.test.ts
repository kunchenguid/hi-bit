import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import { buildRecentSessionsSummary, DEFAULT_RECENT_SESSIONS_LIMIT } from "./recentSessionsSummary";

function makeEntry(overrides: Partial<HarnessInvocationLogEntry> = {}): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-23T10:00:00.000Z",
    harness: "claude",
    role: "kid",
    sessionId: "s-kid-1",
    mode: "start",
    durationMs: 1_000,
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

describe("buildRecentSessionsSummary", () => {
  it("returns empty shape when no entries", () => {
    const result = buildRecentSessionsSummary([]);
    expect(result.rows).toEqual([]);
    expect(result.totals).toEqual({
      totalSessions: 0,
      kidSessions: 0,
      parentSessions: 0,
      totalDurationMs: 0,
    });
  });

  it("aggregates multiple turns for one session into a single row", () => {
    const result = buildRecentSessionsSummary([
      makeEntry({ timestamp: "2026-04-23T10:00:00.000Z", durationMs: 1_000 }),
      makeEntry({ timestamp: "2026-04-23T10:05:00.000Z", durationMs: 2_500 }),
      makeEntry({ timestamp: "2026-04-23T10:10:00.000Z", durationMs: 500 }),
    ]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    if (!row) throw new Error("row missing");
    expect(row.turnCount).toBe(3);
    expect(row.totalDurationMs).toBe(4_000);
    expect(row.firstAt).toBe("2026-04-23T10:00:00.000Z");
    expect(row.lastAt).toBe("2026-04-23T10:10:00.000Z");
  });

  it("sorts rows by lastAt descending", () => {
    const result = buildRecentSessionsSummary([
      makeEntry({ sessionId: "s1", timestamp: "2026-04-23T09:00:00.000Z" }),
      makeEntry({ sessionId: "s2", timestamp: "2026-04-23T11:00:00.000Z" }),
      makeEntry({ sessionId: "s3", timestamp: "2026-04-23T10:00:00.000Z" }),
    ]);
    expect(result.rows.map((r) => r.sessionId)).toEqual(["s2", "s3", "s1"]);
  });

  it("caps rows to the default limit while keeping totals over all sessions", () => {
    const entries: HarnessInvocationLogEntry[] = [];
    for (let i = 0; i < 8; i += 1) {
      entries.push(
        makeEntry({
          sessionId: `s${i}`,
          timestamp: `2026-04-23T1${i}:00:00.000Z`,
          durationMs: 1_000,
        }),
      );
    }
    const result = buildRecentSessionsSummary(entries);
    expect(result.rows).toHaveLength(DEFAULT_RECENT_SESSIONS_LIMIT);
    expect(result.totals.totalSessions).toBe(8);
    expect(result.totals.totalDurationMs).toBe(8_000);
  });

  it("respects a custom limit", () => {
    const result = buildRecentSessionsSummary(
      [
        makeEntry({ sessionId: "s1", timestamp: "2026-04-23T09:00:00.000Z" }),
        makeEntry({ sessionId: "s2", timestamp: "2026-04-23T10:00:00.000Z" }),
        makeEntry({ sessionId: "s3", timestamp: "2026-04-23T11:00:00.000Z" }),
      ],
      2,
    );
    expect(result.rows.map((r) => r.sessionId)).toEqual(["s3", "s2"]);
  });

  it("returns all rows when limit is 0", () => {
    const entries: HarnessInvocationLogEntry[] = [];
    for (let i = 0; i < 8; i += 1) {
      entries.push(makeEntry({ sessionId: `s${i}`, timestamp: `2026-04-23T1${i}:00:00.000Z` }));
    }
    const result = buildRecentSessionsSummary(entries, 0);
    expect(result.rows).toHaveLength(8);
  });

  it("tallies kid/parent session counts in totals", () => {
    const result = buildRecentSessionsSummary([
      makeEntry({ sessionId: "s-k-1", role: "kid" }),
      makeEntry({ sessionId: "s-k-2", role: "kid" }),
      makeEntry({ sessionId: "s-p-1", role: "parent" }),
    ]);
    expect(result.totals).toEqual({
      totalSessions: 3,
      kidSessions: 2,
      parentSessions: 1,
      totalDurationMs: 3_000,
    });
  });

  it("preserves harness + role on the first-seen entry for a session", () => {
    const result = buildRecentSessionsSummary([
      makeEntry({ sessionId: "s1", harness: "claude", role: "kid" }),
      makeEntry({ sessionId: "s1", harness: "claude", role: "kid" }),
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("row missing");
    expect(row.harness).toBe("claude");
    expect(row.role).toBe("kid");
  });
});
