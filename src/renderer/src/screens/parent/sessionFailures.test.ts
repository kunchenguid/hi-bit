import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import { describeSessionFailures } from "./sessionFailures";

function makeEntry(overrides: Partial<HarnessInvocationLogEntry> = {}): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-23T10:00:00.000Z",
    harness: "claude",
    role: "kid",
    sessionId: "sess-abc",
    mode: "start",
    durationMs: 1000,
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

describe("describeSessionFailures", () => {
  it("returns null when entries is null", () => {
    expect(describeSessionFailures(null)).toBeNull();
  });

  it("returns null when entries is undefined", () => {
    expect(describeSessionFailures(undefined)).toBeNull();
  });

  it("returns null when entries is empty", () => {
    expect(describeSessionFailures([])).toBeNull();
  });

  it("returns null when every entry has exitCode 0 and null signal", () => {
    const entries = [makeEntry({ mode: "start" }), makeEntry({ mode: "resume" })];
    expect(describeSessionFailures(entries)).toBeNull();
  });

  it("counts a non-zero exit code as a failure", () => {
    const entries = [
      makeEntry({ exitCode: 0, signal: null }),
      makeEntry({ exitCode: 1, signal: null }),
    ];
    expect(describeSessionFailures(entries)).toEqual({ failureCount: 1, totalTurns: 2 });
  });

  it("counts a null exit code (crash or abort before process exited cleanly) as a failure", () => {
    const entries = [makeEntry({ exitCode: null, signal: null })];
    expect(describeSessionFailures(entries)).toEqual({ failureCount: 1, totalTurns: 1 });
  });

  it("counts a non-null signal as a failure", () => {
    const entries = [makeEntry({ exitCode: 0, signal: "SIGTERM" })];
    expect(describeSessionFailures(entries)).toEqual({ failureCount: 1, totalTurns: 1 });
  });

  it("counts multiple failures across turns", () => {
    const entries = [
      makeEntry({ exitCode: 0, signal: null }),
      makeEntry({ exitCode: 127, signal: null }),
      makeEntry({ exitCode: 0, signal: "SIGKILL" }),
      makeEntry({ exitCode: 0, signal: null }),
    ];
    expect(describeSessionFailures(entries)).toEqual({ failureCount: 2, totalTurns: 4 });
  });

  it("returns totalTurns matching input length regardless of failure count", () => {
    const entries = [
      makeEntry({ exitCode: 1, signal: null }),
      makeEntry({ exitCode: 1, signal: null }),
      makeEntry({ exitCode: 1, signal: null }),
    ];
    expect(describeSessionFailures(entries)).toEqual({ failureCount: 3, totalTurns: 3 });
  });

  it("does not mutate its input array", () => {
    const entries = [
      makeEntry({ exitCode: 1, signal: null }),
      makeEntry({ exitCode: 0, signal: null }),
    ];
    const snapshot = entries.map((e) => ({ ...e }));
    describeSessionFailures(entries);
    expect(entries).toEqual(snapshot);
  });
});
