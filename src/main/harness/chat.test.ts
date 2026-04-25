import { EventEmitter } from "node:events";
import { mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { HarnessDetection, HiBitConfig } from "@shared/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapLayout, type HiBitLayout, profilePathsFor } from "../storage/layout";
import { createProfile } from "../storage/profiles";
import { promptsBitPath } from "../storage/prompts";
import { readSessionLogEntries } from "../storage/sessionLog";
import { readTranscript } from "../storage/transcript";
import { sendKidMessage, sendParentMessage } from "./chat";
import type { HarnessSpawnFn } from "./run";

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

function spawnEmitting(responses: Array<(c: FakeChild) => void>): HarnessSpawnFn {
  let call = 0;
  return () => {
    const c = makeFakeChild();
    const respond = responses[Math.min(call, responses.length - 1)];
    call += 1;
    setImmediate(() => respond?.(c));
    return c as unknown as ReturnType<HarnessSpawnFn>;
  };
}

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

describe("sendKidMessage", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-chat-"));
    layout = await bootstrapLayout(root);
    await writeFile(promptsBitPath(layout), "# Bit\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeAda() {
    return createProfile(layout, { name: "Ada", age: 8 });
  }

  it("runs a start-mode turn, writes transcript + log, returns ok result", async () => {
    const profile = await makeAda();
    const spawn = spawnEmitting([
      (c) => {
        c.stdout?.emit("data", "hi ada");
        c.emit("close", 0, null);
      },
    ]);

    const result = await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "hello",
      spawn,
    });

    expect(result).toEqual({ ok: true, text: "hi ada", durationMs: expect.any(Number) });

    const paths = profilePathsFor(layout, profile.id);
    const events = await readTranscript(paths, profile.sessions.kid);
    expect(events.map((e) => e.kind)).toEqual(["user_message", "assistant_message"]);
    const log = await readSessionLogEntries(paths);
    expect(log).toHaveLength(1);
    expect(log[0]?.mode).toBe("start");
    expect(log[0]?.role).toBe("kid");
  });

  it("injects the kid session-context preamble into the first-turn (start-mode) agent prompt while keeping the transcript user text raw", async () => {
    const profile = await makeAda();
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "hi bit",
      spawn,
    });

    const args = spawnArgs[0] as string[];
    const promptArg = args[args.indexOf("-p") + 1];
    expect(promptArg).toMatch(/<hibit-context>/);
    expect(promptArg).toMatch(/mode:\s*kid/);
    expect(promptArg).toMatch(/Ada/);
    expect(promptArg?.endsWith("hi bit")).toBe(true);

    const paths = profilePathsFor(layout, profile.id);
    const events = await readTranscript(paths, profile.sessions.kid);
    const userEvent = events.find((e) => e.kind === "user_message");
    expect(userEvent?.text).toBe("hi bit");
  });

  it("does not inject the preamble on resume-mode turns", async () => {
    const profile = await makeAda();
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "first",
      spawn,
    });
    await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "second",
      spawn,
    });

    const secondArgs = spawnArgs[1] as string[];
    const secondPromptArg = secondArgs[secondArgs.indexOf("-p") + 1];
    expect(secondPromptArg).toBe("second");
  });

  it("uses resume mode once a prior successful invocation is on record", async () => {
    const profile = await makeAda();
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "one",
      spawn,
    });
    await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "two",
      spawn,
    });

    expect(spawnArgs[0]).toContain("-p");
    expect(spawnArgs[0]).not.toContain("--resume");
    expect(spawnArgs[1]).toContain("--resume");
  });

  it("self-heals a profile missing state.md / progress.json / AGENTS.md / CLAUDE.md before spawning", async () => {
    const profile = await makeAda();
    const paths = profilePathsFor(layout, profile.id);
    await unlink(paths.stateFile);
    await unlink(paths.progressFile);
    await unlink(paths.agentsFile);
    await unlink(paths.claudeFile);

    const spawn = spawnEmitting([
      (c) => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      },
    ]);

    const result = await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "hi",
      spawn,
    });

    expect(result.ok).toBe(true);
    await expect(stat(paths.stateFile)).resolves.toBeDefined();
    await expect(stat(paths.progressFile)).resolves.toBeDefined();
    await expect(stat(paths.agentsFile)).resolves.toBeDefined();
    await expect(stat(paths.claudeFile)).resolves.toBeDefined();
  });

  it("returns ok=false with error when harness exits non-zero", async () => {
    const profile = await makeAda();
    const spawn = spawnEmitting([
      (c) => {
        c.stderr?.emit("data", "boom");
        c.emit("close", 2, null);
      },
    ]);

    const result = await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "hello",
      spawn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/boom/);
  });

  it("returns ok=false when profile is missing", async () => {
    const result = await sendKidMessage({
      layout,
      config,
      detection,
      profileId: "nope",
      prompt: "hi",
      spawn: spawnEmitting([() => {}]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/profile/i);
  });

  it("returns ok=false when no default harness is configured", async () => {
    const profile = await makeAda();
    const result = await sendKidMessage({
      layout,
      config: { version: 1, harness: {} },
      detection,
      profileId: profile.id,
      prompt: "hi",
      spawn: spawnEmitting([() => {}]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/default agent/i);
  });

  it("returns ok=false when the default harness binary is not on disk", async () => {
    const profile = await makeAda();
    const result = await sendKidMessage({
      layout,
      config: { version: 1, harness: {}, defaultHarness: "codex" },
      detection: { claude: null, codex: null, opencode: null },
      profileId: profile.id,
      prompt: "hi",
      spawn: spawnEmitting([() => {}]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/binary/i);
  });

  it("returns ok=false when prompt is empty", async () => {
    const profile = await makeAda();
    const result = await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "   ",
      spawn: spawnEmitting([() => {}]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/prompt/i);
  });

  it("falls back to detection.path when config has no binary for the default harness", async () => {
    const profile = await makeAda();
    const bins: string[] = [];
    const spawn: HarnessSpawnFn = (bin) => {
      bins.push(bin);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "fine");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };
    const result = await sendKidMessage({
      layout,
      config: { version: 1, harness: {}, defaultHarness: "claude" },
      detection: { claude: "/usr/bin/claude", codex: null, opencode: null },
      profileId: profile.id,
      prompt: "hi",
      spawn,
    });
    expect(result.ok).toBe(true);
    expect(bins[0]).toBe("/usr/bin/claude");
  });
});

describe("sendParentMessage", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-parent-chat-"));
    layout = await bootstrapLayout(root);
    await writeFile(promptsBitPath(layout), "# Bit\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeAda() {
    return createProfile(layout, { name: "Ada", age: 8 });
  }

  it("injects the parent session-context preamble on the first parent-mode turn", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    await sendParentMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "summarize",
      spawn,
    });

    const args = spawnArgs[0] as string[];
    const promptArg = args[args.indexOf("-p") + 1];
    expect(promptArg).toMatch(/<hibit-context>/);
    expect(promptArg).toMatch(/mode:\s*parent/);
  });

  it("runs a parent turn against the parent session, writes role=parent to log + transcript", async () => {
    const profile = await makeAda();
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "parent summary");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    const result = await sendParentMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "summarize ada's last three sessions",
      spawn,
    });

    expect(result).toEqual({
      ok: true,
      text: "parent summary",
      durationMs: expect.any(Number),
    });
    expect(spawnArgs[0]).toContain("--session-id");
    expect(spawnArgs[0]).toContain(profile.sessions.parent);

    const paths = profilePathsFor(layout, profile.id);
    const kidEvents = await readTranscript(paths, profile.sessions.kid);
    expect(kidEvents).toEqual([]);
    const parentEvents = await readTranscript(paths, profile.sessions.parent);
    expect(parentEvents.map((e) => e.kind)).toEqual(["user_message", "assistant_message"]);
    expect(parentEvents.every((e) => e.role === "parent")).toBe(true);

    const log = await readSessionLogEntries(paths);
    expect(log).toHaveLength(1);
    expect(log[0]?.role).toBe("parent");
    expect(log[0]?.sessionId).toBe(profile.sessions.parent);
    expect(log[0]?.mode).toBe("start");
  });

  it("uses start mode for the parent session even after the kid session has succeeded", async () => {
    const profile = await makeAda();
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    await sendKidMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "kid turn",
      spawn,
    });
    await sendParentMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "parent turn",
      spawn,
    });

    expect(spawnArgs[0]).toContain("-p");
    expect(spawnArgs[0]).not.toContain("--resume");
    expect(spawnArgs[1]).toContain("-p");
    expect(spawnArgs[1]).not.toContain("--resume");
  });

  it("resumes the parent session on the second parent turn", async () => {
    const profile = await makeAda();
    const spawnArgs: Array<readonly string[]> = [];
    const spawn: HarnessSpawnFn = (_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      setImmediate(() => {
        c.stdout?.emit("data", "ok");
        c.emit("close", 0, null);
      });
      return c as unknown as ReturnType<HarnessSpawnFn>;
    };

    await sendParentMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "one",
      spawn,
    });
    await sendParentMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "two",
      spawn,
    });

    expect(spawnArgs[0]).toContain("-p");
    expect(spawnArgs[0]).not.toContain("--resume");
    expect(spawnArgs[1]).toContain("--resume");
    const resumeIdx = (spawnArgs[1] as readonly string[]).indexOf("--resume");
    expect((spawnArgs[1] as readonly string[])[resumeIdx + 1]).toBe(profile.sessions.parent);
  });

  it("returns ok=false with error when prompt is empty", async () => {
    const profile = await makeAda();
    const result = await sendParentMessage({
      layout,
      config,
      detection,
      profileId: profile.id,
      prompt: "   ",
      spawn: spawnEmitting([() => {}]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/prompt/i);
  });

  it("returns ok=false when profile is missing", async () => {
    const result = await sendParentMessage({
      layout,
      config,
      detection,
      profileId: "nope",
      prompt: "hi",
      spawn: spawnEmitting([() => {}]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/profile/i);
  });
});
