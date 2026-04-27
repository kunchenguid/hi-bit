import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapLayout, bootstrapProfileDirs, profilePathsFor } from "../storage/layout";
import { readSessionLogEntries } from "../storage/sessionLog";
import { readTranscript } from "../storage/transcript";
import { claudeOkStreamJson } from "./claudeStreamJsonFixture";
import type { HarnessSpawnFn } from "./run";
import { executeHarnessTurn } from "./turn";

type FakeChild = EventEmitter & {
  stdout: Readable | null;
  stderr: Readable | null;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

function makeFakeChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.stdout = new Readable({ read() {} });
  ee.stderr = new Readable({ read() {} });
  ee.kill = vi.fn(() => true);
  return ee;
}

function spawnThat(child: FakeChild, after: (c: FakeChild) => void): HarnessSpawnFn {
  return () => {
    setImmediate(() => after(child));
    return child as unknown as ReturnType<HarnessSpawnFn>;
  };
}

describe("executeHarnessTurn", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-turn-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeNow(values: number[]): () => number {
    let i = 0;
    return () => {
      const v = values[Math.min(i, values.length - 1)];
      i += 1;
      if (v === undefined) throw new Error("makeNow exhausted");
      return v;
    };
  }

  it("writes user then assistant transcript events and a session-log entry on success", async () => {
    const child = makeFakeChild();
    const spawn = spawnThat(child, (c) => {
      c.stdout?.emit(
        "data",
        claudeOkStreamJson({
          result: "hello back",
          inputTokens: 12,
          outputTokens: 4,
          cacheCreationInputTokens: 100,
          cacheReadInputTokens: 5000,
        }),
      );
      c.emit("close", 0, null);
    });

    const result = await executeHarnessTurn({
      paths,
      harness: "claude",
      binary: "/usr/local/bin/claude",
      sessionId: "sess-kid",
      mode: "start",
      prompt: "hi bit",
      role: "kid",
      cwd: paths.root,
      spawn,
      now: makeNow([1700000000000, 1700000001500]),
    });

    expect(result.run.exitCode).toBe(0);
    expect(result.durationMs).toBe(1500);
    expect(result.text).toBe("hello back");

    const events = await readTranscript(paths, "sess-kid");
    expect(events).toEqual([
      {
        timestamp: "2023-11-14T22:13:20.000Z",
        role: "kid",
        sessionId: "sess-kid",
        kind: "user_message",
        text: "hi bit",
      },
      {
        timestamp: "2023-11-14T22:13:21.500Z",
        role: "kid",
        sessionId: "sess-kid",
        kind: "assistant_message",
        text: "hello back",
      },
    ]);

    const log = await readSessionLogEntries(paths);
    expect(log).toEqual([
      {
        timestamp: "2023-11-14T22:13:20.000Z",
        harness: "claude",
        role: "kid",
        sessionId: "sess-kid",
        mode: "start",
        durationMs: 1500,
        exitCode: 0,
        signal: null,
        tokensInput: 12,
        tokensOutput: 4,
        cacheCreationInputTokens: 100,
        cacheReadInputTokens: 5000,
      },
    ]);
  });

  it("passes the built command (bin, args, cwd) through to spawn", async () => {
    const child = makeFakeChild();
    const inner = vi.fn<HarnessSpawnFn>(() => {
      setImmediate(() => child.emit("close", 0, null));
      return child as unknown as ReturnType<HarnessSpawnFn>;
    });

    await executeHarnessTurn({
      paths,
      harness: "codex",
      binary: "/usr/local/bin/codex",
      sessionId: "sess-parent",
      mode: "resume",
      prompt: "summarize today",
      role: "parent",
      cwd: paths.root,
      spawn: inner,
      now: makeNow([1000, 2000]),
    });

    expect(inner).toHaveBeenCalledWith(
      "/usr/local/bin/codex",
      [
        "exec",
        "resume",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--full-auto",
        "-c",
        'model_reasoning_effort="low"',
        "sess-parent",
        "summarize today",
      ],
      { cwd: paths.root },
    );
  });

  it("writes an error transcript event on non-zero exit and records exit in the session log", async () => {
    const child = makeFakeChild();
    const spawn = spawnThat(child, (c) => {
      c.stderr?.emit("data", "boom");
      c.emit("close", 2, null);
    });

    const result = await executeHarnessTurn({
      paths,
      harness: "opencode",
      binary: "/usr/local/bin/opencode",
      sessionId: "sess-kid",
      mode: "resume",
      prompt: "keep going",
      role: "kid",
      cwd: paths.root,
      spawn,
      now: makeNow([1000, 4000]),
    });

    expect(result.run.exitCode).toBe(2);

    const events = await readTranscript(paths, "sess-kid");
    expect(events.map((e) => e.kind)).toEqual(["user_message", "error"]);
    expect(events[1]?.text).toBe("boom");

    const log = await readSessionLogEntries(paths);
    expect(log[0]?.exitCode).toBe(2);
    expect(log[0]?.durationMs).toBe(3000);
  });

  it("writes an error event and rethrows when spawn itself emits 'error'", async () => {
    const child = makeFakeChild();
    const spawn = spawnThat(child, (c) => {
      c.emit("error", new Error("ENOENT: no such binary"));
    });

    await expect(
      executeHarnessTurn({
        paths,
        harness: "claude",
        binary: "/nope/claude",
        sessionId: "sess-kid",
        mode: "start",
        prompt: "hi",
        role: "kid",
        cwd: paths.root,
        spawn,
        now: makeNow([1000, 1200]),
      }),
    ).rejects.toThrow(/ENOENT/);

    const events = await readTranscript(paths, "sess-kid");
    expect(events.map((e) => e.kind)).toEqual(["user_message", "error"]);
    expect(events[1]?.text).toMatch(/ENOENT/);

    const log = await readSessionLogEntries(paths);
    expect(log[0]?.exitCode).toBeNull();
    expect(log[0]?.durationMs).toBe(200);
  });

  it("logs the raw userPrompt to the transcript but sends agentPrompt to the spawned process", async () => {
    const child = makeFakeChild();
    const inner = vi.fn<HarnessSpawnFn>(() => {
      setImmediate(() => {
        child.stdout?.emit("data", "ok");
        child.emit("close", 0, null);
      });
      return child as unknown as ReturnType<HarnessSpawnFn>;
    });

    await executeHarnessTurn({
      paths,
      harness: "claude",
      binary: "/usr/local/bin/claude",
      sessionId: "sess-kid",
      mode: "start",
      prompt: "hi",
      agentPrompt: "<hibit-context>mode: kid</hibit-context>\n\nhi",
      role: "kid",
      cwd: paths.root,
      spawn: inner,
      now: makeNow([1000, 2000]),
    });

    const args = inner.mock.calls[0]?.[1] as string[];
    const promptArg = args[args.indexOf("-p") + 1];
    expect(promptArg).toMatch(/hibit-context/);
    expect(promptArg?.endsWith("hi")).toBe(true);

    const events = await readTranscript(paths, "sess-kid");
    const userEvent = events.find((e) => e.kind === "user_message");
    expect(userEvent?.text).toBe("hi");
  });

  it("forwards onEvent chunks from the underlying runHarness", async () => {
    const child = makeFakeChild();
    const spawn = spawnThat(child, (c) => {
      c.stdout?.emit("data", "a");
      c.stderr?.emit("data", "b");
      c.emit("close", 0, null);
    });
    const events: Array<{ kind: string; data: string }> = [];

    await executeHarnessTurn({
      paths,
      harness: "claude",
      binary: "/usr/local/bin/claude",
      sessionId: "sess-kid",
      mode: "start",
      prompt: "hi",
      role: "kid",
      cwd: paths.root,
      spawn,
      now: makeNow([1000, 2000]),
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([
      { kind: "stdout", data: "a" },
      { kind: "stderr", data: "b" },
    ]);
  });
});
