import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { describe, expect, it } from "vitest";
import { describeSessionTokens, formatTokenCount } from "./sessionTokens";

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

describe("describeSessionTokens", () => {
  it("returns null when entries is null", () => {
    expect(describeSessionTokens(null)).toBeNull();
  });

  it("returns null when entries is undefined", () => {
    expect(describeSessionTokens(undefined)).toBeNull();
  });

  it("returns null when entries is empty", () => {
    expect(describeSessionTokens([])).toBeNull();
  });

  it("returns null when no entry has token fields", () => {
    const entries = [makeEntry(), makeEntry({ mode: "resume" })];
    expect(describeSessionTokens(entries)).toBeNull();
  });

  it("returns null when every entry has zero tokens on both fields", () => {
    const entries = [makeEntry({ tokensInput: 0, tokensOutput: 0 })];
    expect(describeSessionTokens(entries)).toBeNull();
  });

  it("sums tokensInput and tokensOutput across entries", () => {
    const entries = [
      makeEntry({ tokensInput: 100, tokensOutput: 50 }),
      makeEntry({ tokensInput: 200, tokensOutput: 25 }),
    ];
    expect(describeSessionTokens(entries)).toEqual({
      tokensInput: 300,
      tokensOutput: 75,
      total: 375,
    });
  });

  it("tolerates entries missing one of the two token fields", () => {
    const entries = [makeEntry({ tokensInput: 100 }), makeEntry({ tokensOutput: 50 })];
    expect(describeSessionTokens(entries)).toEqual({
      tokensInput: 100,
      tokensOutput: 50,
      total: 150,
    });
  });

  it("reports ACP context usage when input and output token fields are absent", () => {
    const entries = [
      makeEntry({ contextTokensUsed: 100, contextTokensSize: 1000 }),
      makeEntry({ contextTokensUsed: 250, contextTokensSize: 1000 }),
    ];
    expect(describeSessionTokens(entries)).toEqual({
      tokensInput: 0,
      tokensOutput: 0,
      total: 250,
      contextTokensUsed: 250,
      contextTokensSize: 1000,
    });
  });

  it("treats negative values as zero but still considers the field recorded", () => {
    const entries = [makeEntry({ tokensInput: -5, tokensOutput: 10 })];
    expect(describeSessionTokens(entries)).toEqual({
      tokensInput: 0,
      tokensOutput: 10,
      total: 10,
    });
  });

  it("ignores NaN and Infinity values", () => {
    const entries = [
      makeEntry({ tokensInput: Number.NaN, tokensOutput: 10 }),
      makeEntry({ tokensInput: 20, tokensOutput: Number.POSITIVE_INFINITY }),
    ];
    expect(describeSessionTokens(entries)).toEqual({
      tokensInput: 20,
      tokensOutput: 10,
      total: 30,
    });
  });

  it("does not mutate its input array", () => {
    const entries = [makeEntry({ tokensInput: 100, tokensOutput: 50 })];
    const snapshot = entries.map((e) => ({ ...e }));
    describeSessionTokens(entries);
    expect(entries).toEqual(snapshot);
  });
});

describe("formatTokenCount", () => {
  it("returns 0 for non-finite or negative", () => {
    expect(formatTokenCount(Number.NaN)).toBe("0");
    expect(formatTokenCount(-5)).toBe("0");
  });

  it("shows raw integer under 1000", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1)).toBe("1");
  });

  it("abbreviates thousands with one decimal when under 10k", () => {
    expect(formatTokenCount(1000)).toBe("1k");
    expect(formatTokenCount(1500)).toBe("1.5k");
    expect(formatTokenCount(9499)).toBe("9.5k");
  });

  it("rounds to whole k between 10k and 1M", () => {
    expect(formatTokenCount(10_000)).toBe("10k");
    expect(formatTokenCount(12_345)).toBe("12k");
    expect(formatTokenCount(999_000)).toBe("999k");
  });

  it("abbreviates millions similarly", () => {
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
    expect(formatTokenCount(25_000_000)).toBe("25M");
  });
});
