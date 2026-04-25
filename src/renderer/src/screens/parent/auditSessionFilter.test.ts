import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ROLE_FILTER_LABELS,
  AUDIT_ROLE_FILTERS,
  countAuditSessionsByRoleFilter,
  filterSessionsByRole,
} from "./auditSessionFilter";

function makeEntry(sessionId: string, role: SessionRole): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-23T00:00:00.000Z",
    harness: "claude",
    role,
    sessionId,
    mode: "start",
    durationMs: 100,
    exitCode: 0,
    signal: null,
  };
}

describe("filterSessionsByRole", () => {
  it("returns all sessions when filter is 'all'", () => {
    const entries = [makeEntry("a", "kid"), makeEntry("b", "parent")];
    expect(filterSessionsByRole(entries, "all")).toEqual(entries);
  });

  it("preserves order when filter is 'all'", () => {
    const entries = [makeEntry("z", "parent"), makeEntry("a", "kid"), makeEntry("m", "kid")];
    expect(filterSessionsByRole(entries, "all").map((e) => e.sessionId)).toEqual(["z", "a", "m"]);
  });

  it("returns only kid sessions when filter is 'kid'", () => {
    const entries = [
      makeEntry("k1", "kid"),
      makeEntry("p1", "parent"),
      makeEntry("k2", "kid"),
      makeEntry("p2", "parent"),
    ];
    expect(filterSessionsByRole(entries, "kid").map((e) => e.sessionId)).toEqual(["k1", "k2"]);
  });

  it("returns only parent sessions when filter is 'parent'", () => {
    const entries = [
      makeEntry("k1", "kid"),
      makeEntry("p1", "parent"),
      makeEntry("k2", "kid"),
      makeEntry("p2", "parent"),
    ];
    expect(filterSessionsByRole(entries, "parent").map((e) => e.sessionId)).toEqual(["p1", "p2"]);
  });

  it("returns an empty list when no entry matches the role", () => {
    const entries = [makeEntry("k1", "kid")];
    expect(filterSessionsByRole(entries, "parent")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of filter", () => {
    expect(filterSessionsByRole([], "all")).toEqual([]);
    expect(filterSessionsByRole([], "kid")).toEqual([]);
    expect(filterSessionsByRole([], "parent")).toEqual([]);
  });
});

describe("AUDIT_ROLE_FILTERS", () => {
  it("contains all three filter keys in order: all, kid, parent", () => {
    expect(AUDIT_ROLE_FILTERS).toEqual(["all", "kid", "parent"]);
  });
});

describe("AUDIT_ROLE_FILTER_LABELS", () => {
  it("maps each filter key to its lowercase label", () => {
    expect(AUDIT_ROLE_FILTER_LABELS).toEqual({ all: "all", kid: "kid", parent: "parent" });
  });
});

describe("countAuditSessionsByRoleFilter", () => {
  it("returns zero for every filter on an empty list", () => {
    expect(countAuditSessionsByRoleFilter([])).toEqual({ all: 0, kid: 0, parent: 0 });
  });

  it("counts unique sessionIds per role, not invocations", () => {
    const entries = [
      makeEntry("k1", "kid"),
      makeEntry("k1", "kid"),
      makeEntry("k2", "kid"),
      makeEntry("p1", "parent"),
      makeEntry("p1", "parent"),
      makeEntry("p2", "parent"),
      makeEntry("p2", "parent"),
    ];
    expect(countAuditSessionsByRoleFilter(entries)).toEqual({ all: 4, kid: 2, parent: 2 });
  });

  it("handles kid-only input", () => {
    const entries = [makeEntry("a", "kid"), makeEntry("b", "kid"), makeEntry("c", "kid")];
    expect(countAuditSessionsByRoleFilter(entries)).toEqual({ all: 3, kid: 3, parent: 0 });
  });

  it("handles parent-only input", () => {
    const entries = [makeEntry("a", "parent"), makeEntry("b", "parent")];
    expect(countAuditSessionsByRoleFilter(entries)).toEqual({ all: 2, kid: 0, parent: 2 });
  });

  it("all matches the sum of kid and parent when roles are disjoint per sessionId", () => {
    const entries = [
      makeEntry("k1", "kid"),
      makeEntry("p1", "parent"),
      makeEntry("k2", "kid"),
      makeEntry("p2", "parent"),
    ];
    const counts = countAuditSessionsByRoleFilter(entries);
    expect(counts.all).toBe(counts.kid + counts.parent);
  });

  it("does not mutate the input list", () => {
    const entries = [makeEntry("k1", "kid"), makeEntry("p1", "parent")];
    const snapshot = [...entries];
    countAuditSessionsByRoleFilter(entries);
    expect(entries).toEqual(snapshot);
  });
});
