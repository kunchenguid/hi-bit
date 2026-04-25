import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import type { HarnessDetection, HiBitConfig } from "@shared/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapLayout, type HiBitLayout, profilePathsFor } from "../storage/layout";
import { createProfile } from "../storage/profiles";
import { promptsBitPath } from "../storage/prompts";
import { readSessionLogEntries } from "../storage/sessionLog";
import { readTranscript } from "../storage/transcript";
import { sendKidMessage } from "./chat";
import type { ClaudeSession } from "./claudeSession";
import { ClaudeSessionRegistry } from "./claudeSessionRegistry";
import type { HarnessSpawnFn } from "./run";

type FakeChild = EventEmitter & {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill: (signal?: NodeJS.Signals | number) => boolean;
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
    emitStdout: (s) => ee.stdout.emit("data", Buffer.from(s, "utf8")),
    emitStderr: (s) => ee.stderr.emit("data", Buffer.from(s, "utf8")),
    close: (code = 0, signal = null) => ee.emit("close", code, signal),
  };
}

async function waitForStdinWrites(handle: FakeChildHandle, count: number): Promise<void> {
  const deadline = Date.now() + 2000;
  while (handle.written.length < count) {
    if (Date.now() > deadline) throw new Error(`stdin write count never reached ${count}`);
    await new Promise((r) => setImmediate(r));
  }
}

async function respondAfterWrite(
  handle: FakeChildHandle,
  writeIndex: number,
  payload: string,
): Promise<void> {
  await waitForStdinWrites(handle, writeIndex + 1);
  handle.emitStdout(payload);
}

const RESULT = (text: string, usage = { input_tokens: 5, output_tokens: 7 }) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: text,
    duration_api_ms: 100,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { ...usage, cache_creation_input_tokens: 0, cache_read_input_tokens: 12 },
  });

const DELTA = (text: string) =>
  JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text } },
  });

const config: HiBitConfig = {
  version: 1,
  harness: { claude: "/usr/local/bin/claude" },
  defaultHarness: "claude",
};
const detection: HarnessDetection = {
  claude: "/usr/local/bin/claude",
  codex: null,
  opencode: null,
};

describe("sendKidMessage with claudeRegistry (streaming path)", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-stream-"));
    layout = await bootstrapLayout(root);
    await writeFile(promptsBitPath(layout), "# Bit\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("spawns claude with --input-format stream-json and reuses the process across turns", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const registry = new ClaudeSessionRegistry<ClaudeSession>();

    const handle = makeFakeChild();
    const spawn: HarnessSpawnFn = vi.fn(
      () => handle.child as unknown as ReturnType<HarnessSpawnFn>,
    );

    const turn1 = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "first",
      spawn,
      claudeRegistry: registry,
    });
    await respondAfterWrite(handle, 0, `${RESULT("reply 1")}\n`);
    const r1 = await turn1;
    expect(r1.ok).toBe(true);

    const turn2 = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "second",
      spawn,
      claudeRegistry: registry,
    });
    await respondAfterWrite(handle, 1, `${RESULT("reply 2")}\n`);
    const r2 = await turn2;
    expect(r2.ok).toBe(true);

    expect(spawn).toHaveBeenCalledTimes(1);
    const args =
      (spawn as unknown as { mock: { calls: [unknown, string[]][] } }).mock.calls[0]?.[1] ?? [];
    expect(args).toContain("--input-format");
    expect(args[args.indexOf("--input-format") + 1]).toBe("stream-json");
  });

  it("injects the kid preamble only on the first turn of a fresh process", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const registry = new ClaudeSessionRegistry<ClaudeSession>();
    const handle = makeFakeChild();
    const spawn: HarnessSpawnFn = () => handle.child as unknown as ReturnType<HarnessSpawnFn>;

    const t1 = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "first",
      spawn,
      claudeRegistry: registry,
    });
    await respondAfterWrite(handle, 0, `${RESULT("r1")}\n`);
    await t1;

    const t2 = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "second",
      spawn,
      claudeRegistry: registry,
    });
    await respondAfterWrite(handle, 1, `${RESULT("r2")}\n`);
    await t2;

    expect(handle.written).toHaveLength(2);
    const msg1 = JSON.parse(handle.written[0]?.trim() ?? "");
    const msg2 = JSON.parse(handle.written[1]?.trim() ?? "");

    expect(msg1.message.content[0].text).toMatch(/<hibit-context>/);
    expect(msg1.message.content[0].text).toMatch(/Ada/);
    expect(msg1.message.content[0].text).toMatch(/first$/);
    expect(msg2.message.content[0].text).toBe("second");
  });

  it("forwards content_block_delta text to onDelta and writes assistant transcript on completion", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const registry = new ClaudeSessionRegistry<ClaudeSession>();
    const handle = makeFakeChild();
    const spawn: HarnessSpawnFn = () => handle.child as unknown as ReturnType<HarnessSpawnFn>;

    const deltas: string[] = [];
    const turn = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "hi",
      spawn,
      claudeRegistry: registry,
      onDelta: (t) => deltas.push(t),
    });

    await waitForStdinWrites(handle, 1);
    handle.emitStdout(`${DELTA("Hi ")}\n${DELTA("Ada!")}\n`);
    handle.emitStdout(`${RESULT("Hi Ada!")}\n`);

    const result = await turn;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("Hi Ada!");
    expect(deltas.join("")).toBe("Hi Ada!");

    const paths = profilePathsFor(layout, profile.id);
    const events = await readTranscript(paths, profile.sessions.kid);
    expect(events.map((e) => e.kind)).toEqual(["user_message", "assistant_message"]);
    expect(events[1]?.text).toBe("Hi Ada!");
  });

  it("records usage tokens on the session log entry", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const registry = new ClaudeSessionRegistry<ClaudeSession>();
    const handle = makeFakeChild();
    const spawn: HarnessSpawnFn = () => handle.child as unknown as ReturnType<HarnessSpawnFn>;

    const turn = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "hi",
      spawn,
      claudeRegistry: registry,
    });
    await respondAfterWrite(handle, 0, `${RESULT("ok")}\n`);
    await turn;

    const paths = profilePathsFor(layout, profile.id);
    const log = await readSessionLogEntries(paths);
    expect(log).toHaveLength(1);
    expect(log[0]?.tokensInput).toBe(5);
    expect(log[0]?.tokensOutput).toBe(7);
    expect(log[0]?.cacheReadInputTokens).toBe(12);
    expect(log[0]?.cacheCreationInputTokens).toBe(0);
  });

  it("respawns if the previous session process has died", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const registry = new ClaudeSessionRegistry<ClaudeSession>();

    const handles: FakeChildHandle[] = [];
    const spawn: HarnessSpawnFn = () => {
      const h = makeFakeChild();
      handles.push(h);
      return h.child as unknown as ReturnType<HarnessSpawnFn>;
    };
    const waitForSpawn = async (n: number) => {
      const deadline = Date.now() + 2000;
      while (handles.length < n) {
        if (Date.now() > deadline) throw new Error(`spawn count never reached ${n}`);
        await new Promise((r) => setImmediate(r));
      }
    };

    const t1 = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "first",
      spawn,
      claudeRegistry: registry,
    });
    await waitForSpawn(1);
    const h1 = handles[0] as FakeChildHandle;
    await waitForStdinWrites(h1, 1);
    h1.emitStdout(`${RESULT("r1")}\n`);
    await t1;

    h1.close(0, null);
    await new Promise((r) => setImmediate(r));

    const t2 = sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "second",
      spawn,
      claudeRegistry: registry,
    });
    await waitForSpawn(2);
    const h2 = handles[1] as FakeChildHandle;
    await waitForStdinWrites(h2, 1);
    h2.emitStdout(`${RESULT("r2")}\n`);
    const r2 = await t2;
    expect(r2.ok).toBe(true);
    expect(handles).toHaveLength(2);
  });
});
