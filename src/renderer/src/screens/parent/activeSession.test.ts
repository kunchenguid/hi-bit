import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import {
  buildActiveSessionsPanel,
  computeActiveSessionStatus,
  DEFAULT_ACTIVE_SESSION_IDLE_GAP_MS,
} from "./activeSession";

const MINUTE_MS = 60_000;

function makeEntry(over: Partial<HarnessInvocationLogEntry> = {}): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-23T12:00:00.000Z",
    harness: "claude",
    role: "kid",
    sessionId: "s-1",
    mode: "start",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    ...over,
  };
}

describe("computeActiveSessionStatus", () => {
  it("returns under when elapsed is below 80% of the target", () => {
    expect(computeActiveSessionStatus(10, 20)).toBe("under");
  });

  it("returns near at 80% of the target (floored)", () => {
    expect(computeActiveSessionStatus(16, 20)).toBe("near");
    expect(computeActiveSessionStatus(19, 20)).toBe("near");
  });

  it("returns over once elapsed reaches the target", () => {
    expect(computeActiveSessionStatus(20, 20)).toBe("over");
    expect(computeActiveSessionStatus(45, 20)).toBe("over");
  });

  it("returns under when the target is zero or negative", () => {
    expect(computeActiveSessionStatus(30, 0)).toBe("under");
    expect(computeActiveSessionStatus(30, -5)).toBe("under");
  });
});

describe("buildActiveSessionsPanel", () => {
  const nowIso = "2026-04-23T12:30:00.000Z";
  const nowMs = Date.parse(nowIso);

  it("returns both null for empty entries", () => {
    const panel = buildActiveSessionsPanel({ entries: [], targetMinutes: 20, nowMs });
    expect(panel).toEqual({ kid: null, parent: null });
  });

  it("returns null for a role whose last entry is older than the idle gap", () => {
    const entries = [
      makeEntry({
        role: "kid",
        timestamp: "2026-04-23T11:00:00.000Z",
        sessionId: "s-kid",
      }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid).toBeNull();
    expect(panel.parent).toBeNull();
  });

  it("computes kid active session from a single recent entry", () => {
    const entries = [
      makeEntry({
        role: "kid",
        timestamp: "2026-04-23T12:15:00.000Z",
        sessionId: "s-kid",
      }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid).toEqual({
      role: "kid",
      startedAt: "2026-04-23T12:15:00.000Z",
      lastAt: "2026-04-23T12:15:00.000Z",
      turnCount: 1,
      elapsedMs: 15 * MINUTE_MS,
      elapsedMinutes: 15,
      status: "under",
    });
    expect(panel.parent).toBeNull();
  });

  it("walks back across a contiguous run within the idle gap", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:10:00.000Z" }),
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:20:00.000Z" }),
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:25:00.000Z" }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid?.startedAt).toBe("2026-04-23T12:10:00.000Z");
    expect(panel.kid?.turnCount).toBe(3);
    expect(panel.kid?.elapsedMinutes).toBe(20);
    expect(panel.kid?.status).toBe("over");
  });

  it("breaks a run at the idle gap boundary", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "2026-04-23T08:00:00.000Z" }),
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:20:00.000Z" }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid?.startedAt).toBe("2026-04-23T12:20:00.000Z");
    expect(panel.kid?.turnCount).toBe(1);
    expect(panel.kid?.elapsedMinutes).toBe(10);
    expect(panel.kid?.status).toBe("under");
  });

  it("computes kid and parent independently", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:10:00.000Z" }),
      makeEntry({ role: "parent", timestamp: "2026-04-23T12:25:00.000Z" }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid?.role).toBe("kid");
    expect(panel.kid?.elapsedMinutes).toBe(20);
    expect(panel.parent?.role).toBe("parent");
    expect(panel.parent?.elapsedMinutes).toBe(5);
  });

  it("tolerates unsorted input entries", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:25:00.000Z" }),
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:10:00.000Z" }),
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:20:00.000Z" }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid?.startedAt).toBe("2026-04-23T12:10:00.000Z");
    expect(panel.kid?.turnCount).toBe(3);
  });

  it("ignores entries with invalid timestamps for the active-role check", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "not-a-date" }),
    ];
    const panel = buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(panel.kid).toBeNull();
  });

  it("honors a custom idle gap", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:20:00.000Z" }),
    ];
    const panel = buildActiveSessionsPanel({
      entries,
      targetMinutes: 20,
      nowMs,
      idleGapMs: 60_000,
    });
    expect(panel.kid).toBeNull();
  });

  it("does not mutate the entries input", () => {
    const entries: HarnessInvocationLogEntry[] = [
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:25:00.000Z" }),
      makeEntry({ role: "kid", timestamp: "2026-04-23T12:10:00.000Z" }),
    ];
    const snapshot = entries.map((e) => e.timestamp);
    buildActiveSessionsPanel({ entries, targetMinutes: 20, nowMs });
    expect(entries.map((e) => e.timestamp)).toEqual(snapshot);
  });

  it("exposes DEFAULT_ACTIVE_SESSION_IDLE_GAP_MS as 30 minutes", () => {
    expect(DEFAULT_ACTIVE_SESSION_IDLE_GAP_MS).toBe(30 * 60 * 1000);
  });
});
