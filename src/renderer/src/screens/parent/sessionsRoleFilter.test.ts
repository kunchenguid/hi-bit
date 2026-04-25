import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import { buildRecentSessionsSummary } from "./recentSessionsSummary";
import {
  countRecentSessionsByRoleFilter,
  filterRecentSessionsByRole,
  SESSIONS_ROLE_FILTER_LABELS,
  SESSIONS_ROLE_FILTERS,
} from "./sessionsRoleFilter";

function makeEntry(overrides: Partial<HarnessInvocationLogEntry> = {}): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-20T12:00:00.000Z",
    harness: "claude",
    role: "kid",
    sessionId: "sess-kid-1",
    mode: "start",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

describe("SESSIONS_ROLE_FILTERS", () => {
  it("exposes the three filter options in a stable order", () => {
    expect(SESSIONS_ROLE_FILTERS).toEqual(["all", "kid", "parent"]);
  });

  it("ships a label for each filter id", () => {
    for (const id of SESSIONS_ROLE_FILTERS) {
      expect(typeof SESSIONS_ROLE_FILTER_LABELS[id]).toBe("string");
      expect(SESSIONS_ROLE_FILTER_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe("filterRecentSessionsByRole", () => {
  it("returns a new array (not the input reference) on 'all'", () => {
    const summary = buildRecentSessionsSummary([makeEntry()]);
    const out = filterRecentSessionsByRole(summary.rows, "all");
    expect(out).toEqual(summary.rows);
    expect(out).not.toBe(summary.rows);
  });

  it("preserves order on 'all'", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "sess-a", timestamp: "2026-04-20T10:00:00.000Z" }),
      makeEntry({
        sessionId: "sess-b",
        timestamp: "2026-04-20T11:00:00.000Z",
        role: "parent",
      }),
      makeEntry({ sessionId: "sess-c", timestamp: "2026-04-20T12:00:00.000Z" }),
    ]);
    const out = filterRecentSessionsByRole(summary.rows, "all");
    expect(out.map((e) => e.sessionId)).toEqual(summary.rows.map((e) => e.sessionId));
  });

  it("keeps only kid sessions for 'kid'", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "k", role: "kid" }),
      makeEntry({ sessionId: "p", role: "parent", timestamp: "2026-04-20T11:00:00.000Z" }),
    ]);
    const out = filterRecentSessionsByRole(summary.rows, "kid");
    expect(out.map((e) => e.sessionId)).toEqual(["k"]);
  });

  it("keeps only parent sessions for 'parent'", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "k", role: "kid" }),
      makeEntry({ sessionId: "p", role: "parent", timestamp: "2026-04-20T11:00:00.000Z" }),
    ]);
    const out = filterRecentSessionsByRole(summary.rows, "parent");
    expect(out.map((e) => e.sessionId)).toEqual(["p"]);
  });

  it("tolerates an empty input at every filter", () => {
    for (const filter of SESSIONS_ROLE_FILTERS) {
      expect(filterRecentSessionsByRole([], filter)).toEqual([]);
    }
  });

  it("does not mutate the input array", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "k", role: "kid" }),
      makeEntry({ sessionId: "p", role: "parent", timestamp: "2026-04-20T11:00:00.000Z" }),
    ]);
    const snapshot = summary.rows.map((e) => e.sessionId);
    filterRecentSessionsByRole(summary.rows, "kid");
    expect(summary.rows.map((e) => e.sessionId)).toEqual(snapshot);
  });

  it("returns an empty list when no sessions match a specific role", () => {
    const summary = buildRecentSessionsSummary([makeEntry({ sessionId: "k", role: "kid" })]);
    expect(filterRecentSessionsByRole(summary.rows, "parent")).toEqual([]);
  });
});

describe("countRecentSessionsByRoleFilter", () => {
  it("returns zeros for an empty input", () => {
    expect(countRecentSessionsByRoleFilter([])).toEqual({ all: 0, kid: 0, parent: 0 });
  });

  it("counts 'all' as the full entry count regardless of role", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "k1", role: "kid" }),
      makeEntry({ sessionId: "k2", role: "kid", timestamp: "2026-04-20T11:00:00.000Z" }),
      makeEntry({ sessionId: "p1", role: "parent", timestamp: "2026-04-20T10:00:00.000Z" }),
    ]);
    const counts = countRecentSessionsByRoleFilter(summary.rows);
    expect(counts.all).toBe(3);
  });

  it("counts kid and parent sessions separately", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "k1", role: "kid" }),
      makeEntry({ sessionId: "k2", role: "kid", timestamp: "2026-04-20T11:00:00.000Z" }),
      makeEntry({ sessionId: "p1", role: "parent", timestamp: "2026-04-20T10:00:00.000Z" }),
    ]);
    const counts = countRecentSessionsByRoleFilter(summary.rows);
    expect(counts.kid).toBe(2);
    expect(counts.parent).toBe(1);
  });

  it("does not mutate the input array", () => {
    const summary = buildRecentSessionsSummary([
      makeEntry({ sessionId: "k", role: "kid" }),
      makeEntry({ sessionId: "p", role: "parent", timestamp: "2026-04-20T11:00:00.000Z" }),
    ]);
    const snapshot = summary.rows.map((e) => e.sessionId);
    countRecentSessionsByRoleFilter(summary.rows);
    expect(summary.rows.map((e) => e.sessionId)).toEqual(snapshot);
  });
});
