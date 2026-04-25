import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeSession, type ClaudeSessionSpawnFn } from "./claudeSession";

type FakeChild = EventEmitter & {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
};

type FakeChildHandle = {
  child: FakeChild;
  written: string[];
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  close: (code?: number, signal?: NodeJS.Signals | null) => void;
};

function makeFakeChild(): FakeChildHandle {
  const ee = new EventEmitter() as FakeChild;
  const written: string[] = [];
  ee.stdin = new Writable({
    write(chunk, _enc, cb) {
      written.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      cb();
    },
  });
  ee.stdout = new Readable({ read() {} });
  ee.stderr = new Readable({ read() {} });
  ee.kill = vi.fn(() => true);

  return {
    child: ee,
    written,
    emitStdout: (chunk: string) => ee.stdout.emit("data", Buffer.from(chunk, "utf8")),
    emitStderr: (chunk: string) => ee.stderr.emit("data", Buffer.from(chunk, "utf8")),
    close: (code = 0, signal: NodeJS.Signals | null = null) => ee.emit("close", code, signal),
  };
}

function makeSpawn(handle: FakeChildHandle): ClaudeSessionSpawnFn {
  return () => handle.child as unknown as ReturnType<ClaudeSessionSpawnFn>;
}

const TURN_RESULT = (text: string, usage = { input_tokens: 5, output_tokens: 3 }) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: text,
    duration_api_ms: 100,
    num_turns: 1,
    total_cost_usd: 0,
    usage: {
      ...usage,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  });

const ASSISTANT_DELTA = (text: string) =>
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text } },
  });

describe("ClaudeSession", () => {
  let session: ClaudeSession | null = null;

  afterEach(async () => {
    if (session) {
      session.close();
      session = null;
    }
  });

  it("spawns the process with the configured args and writes a stream-json user message to stdin", async () => {
    const handle = makeFakeChild();
    const spawn = vi.fn(makeSpawn(handle));
    session = new ClaudeSession({
      binary: "/usr/local/bin/claude",
      args: ["--effort", "low"],
      cwd: "/tmp/profile",
      sessionId: "sess-kid",
      spawn,
    });

    const turn = session.sendMessage("hi bit");
    setImmediate(() => handle.emitStdout(`${TURN_RESULT("hello back")}\n`));

    const result = await turn.complete;
    expect(result.text).toBe("hello back");

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]?.[0]).toBe("/usr/local/bin/claude");
    expect(spawn.mock.calls[0]?.[1]).toEqual(["--effort", "low"]);
    expect(spawn.mock.calls[0]?.[2]).toEqual({ cwd: "/tmp/profile" });

    expect(handle.written).toHaveLength(1);
    const sent = JSON.parse(handle.written[0]?.trim() ?? "");
    expect(sent).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi bit" }] },
    });
  });

  it("yields per-token deltas before resolving the final text", async () => {
    const handle = makeFakeChild();
    session = new ClaudeSession({
      binary: "claude",
      args: [],
      cwd: ".",
      sessionId: "s",
      spawn: makeSpawn(handle),
    });

    const turn = session.sendMessage("write a haiku");

    const deltas: string[] = [];
    const collect = (async () => {
      for await (const ev of turn.events) {
        if (ev.kind === "delta") deltas.push(ev.text);
      }
    })();

    setImmediate(() => {
      handle.emitStdout(`${ASSISTANT_DELTA("Cherry ")}\n`);
      handle.emitStdout(`${ASSISTANT_DELTA("blossoms ")}\n${ASSISTANT_DELTA("fall.")}\n`);
      handle.emitStdout(`${TURN_RESULT("Cherry blossoms fall.")}\n`);
    });

    const result = await turn.complete;
    await collect;

    expect(deltas.join("")).toBe("Cherry blossoms fall.");
    expect(result.text).toBe("Cherry blossoms fall.");
    expect(result.usage).toEqual({
      inputTokens: 5,
      outputTokens: 3,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });

  it("handles two turns over the same long-lived process", async () => {
    const handle = makeFakeChild();
    const spawn = vi.fn(makeSpawn(handle));
    session = new ClaudeSession({
      binary: "claude",
      args: [],
      cwd: ".",
      sessionId: "s",
      spawn,
    });

    const turn1 = session.sendMessage("first");
    setImmediate(() => handle.emitStdout(`${TURN_RESULT("reply 1")}\n`));
    const r1 = await turn1.complete;
    expect(r1.text).toBe("reply 1");

    const turn2 = session.sendMessage("second");
    setImmediate(() => handle.emitStdout(`${TURN_RESULT("reply 2")}\n`));
    const r2 = await turn2.complete;
    expect(r2.text).toBe("reply 2");

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(handle.written).toHaveLength(2);
    expect(JSON.parse(handle.written[0]?.trim() ?? "").message.content[0].text).toBe("first");
    expect(JSON.parse(handle.written[1]?.trim() ?? "").message.content[0].text).toBe("second");
  });

  it("rejects the in-flight turn when the process exits with a non-zero code", async () => {
    const handle = makeFakeChild();
    session = new ClaudeSession({
      binary: "claude",
      args: [],
      cwd: ".",
      sessionId: "s",
      spawn: makeSpawn(handle),
    });

    const turn = session.sendMessage("hi");
    setImmediate(() => {
      handle.emitStderr("boom");
      handle.close(2, null);
    });

    await expect(turn.complete).rejects.toThrow(/boom|exit|2/i);
  });

  it("rejects the in-flight turn when the process emits an error event", async () => {
    const handle = makeFakeChild();
    session = new ClaudeSession({
      binary: "claude",
      args: [],
      cwd: ".",
      sessionId: "s",
      spawn: makeSpawn(handle),
    });

    const turn = session.sendMessage("hi");
    setImmediate(() => handle.child.emit("error", new Error("ENOENT: no claude")));

    await expect(turn.complete).rejects.toThrow(/ENOENT/);
  });

  it("close() sends SIGTERM to the underlying child", () => {
    const handle = makeFakeChild();
    session = new ClaudeSession({
      binary: "claude",
      args: [],
      cwd: ".",
      sessionId: "s",
      spawn: makeSpawn(handle),
    });

    session.sendMessage("hi");
    session.close();

    expect(handle.child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("returns isAlive=false after the process closes", async () => {
    const handle = makeFakeChild();
    session = new ClaudeSession({
      binary: "claude",
      args: [],
      cwd: ".",
      sessionId: "s",
      spawn: makeSpawn(handle),
    });

    expect(session.isAlive()).toBe(true);
    handle.close(0, null);
    await new Promise((r) => setImmediate(r));
    expect(session.isAlive()).toBe(false);
  });
});
