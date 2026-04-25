import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, bootstrapProfileDirs, profilePathsFor } from "./layout";
import { appendSessionLogEntry, readSessionLogEntries } from "./sessionLog";

describe("session log jsonl", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-sessionlog-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeEntry(
    overrides: Partial<HarnessInvocationLogEntry> = {},
  ): HarnessInvocationLogEntry {
    return {
      timestamp: "2026-04-23T10:00:00.000Z",
      harness: "claude",
      role: "kid",
      sessionId: "sess-1",
      mode: "start",
      durationMs: 1234,
      exitCode: 0,
      signal: null,
      ...overrides,
    };
  }

  it("appends a single entry as a trailing-newline json line", async () => {
    const entry = makeEntry();
    await appendSessionLogEntry(paths, entry);
    const raw = await readFile(paths.sessionLogFile, "utf8");
    expect(raw).toBe(`${JSON.stringify(entry)}\n`);
  });

  it("appends multiple entries in call order, each on its own line", async () => {
    const a = makeEntry({ sessionId: "sess-a", timestamp: "2026-04-23T10:00:00.000Z" });
    const b = makeEntry({
      sessionId: "sess-b",
      timestamp: "2026-04-23T10:05:00.000Z",
      mode: "resume",
      tokensInput: 100,
      tokensOutput: 42,
    });
    await appendSessionLogEntry(paths, a);
    await appendSessionLogEntry(paths, b);
    const raw = await readFile(paths.sessionLogFile, "utf8");
    expect(raw).toBe(`${JSON.stringify(a)}\n${JSON.stringify(b)}\n`);
  });

  it("roundtrips through readSessionLogEntries preserving order and optional fields", async () => {
    const a = makeEntry({ sessionId: "sess-a" });
    const b = makeEntry({
      sessionId: "sess-b",
      mode: "resume",
      exitCode: 2,
      signal: "SIGTERM",
      tokensInput: 7,
      tokensOutput: 9,
    });
    await appendSessionLogEntry(paths, a);
    await appendSessionLogEntry(paths, b);
    const entries = await readSessionLogEntries(paths);
    expect(entries).toEqual([a, b]);
  });

  it("returns an empty array when the session log does not exist yet", async () => {
    const entries = await readSessionLogEntries(paths);
    expect(entries).toEqual([]);
  });

  it("tolerates trailing blank lines when reading", async () => {
    const entry = makeEntry();
    await appendSessionLogEntry(paths, entry);
    await appendSessionLogEntry(paths, entry);
    const entries = await readSessionLogEntries(paths);
    expect(entries).toHaveLength(2);
  });
});
