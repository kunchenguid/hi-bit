import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { HarnessCommand } from "./command";
import { type HarnessSpawnFn, runHarness } from "./run";

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

const baseCommand: HarnessCommand = {
  bin: "/usr/local/bin/fake",
  args: ["-p", "hi"],
  cwd: "/tmp/profile",
};

describe("runHarness", () => {
  it("passes bin, args, and cwd through to the spawn function", async () => {
    const child = makeFakeChild();
    const spawn = vi.fn<HarnessSpawnFn>(() => child as unknown as ReturnType<HarnessSpawnFn>);
    const promise = runHarness({ command: baseCommand, spawn });
    child.stdout?.push(null);
    child.stderr?.push(null);
    child.emit("close", 0, null);
    await promise;
    expect(spawn).toHaveBeenCalledWith("/usr/local/bin/fake", ["-p", "hi"], {
      cwd: "/tmp/profile",
    });
  });

  it("resolves with buffered stdout/stderr and exit code on clean close", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const promise = runHarness({ command: baseCommand, spawn });
    child.stdout?.emit("data", Buffer.from("hello "));
    child.stdout?.emit("data", "world");
    child.stderr?.emit("data", "warn: nothing");
    child.emit("close", 0, null);
    const result = await promise;
    expect(result).toEqual({
      exitCode: 0,
      signal: null,
      stdout: "hello world",
      stderr: "warn: nothing",
    });
  });

  it("streams each chunk to onEvent as it arrives, preserving kind", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const events: Array<{ kind: string; data: string }> = [];
    const promise = runHarness({
      command: baseCommand,
      spawn,
      onEvent: (e) => events.push(e),
    });
    child.stdout?.emit("data", "a");
    child.stderr?.emit("data", "e1");
    child.stdout?.emit("data", Buffer.from("b"));
    child.emit("close", 0, null);
    await promise;
    expect(events).toEqual([
      { kind: "stdout", data: "a" },
      { kind: "stderr", data: "e1" },
      { kind: "stdout", data: "b" },
    ]);
  });

  it("resolves with a non-zero exit code rather than rejecting", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const promise = runHarness({ command: baseCommand, spawn });
    child.stderr?.emit("data", "boom");
    child.emit("close", 2, null);
    const result = await promise;
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("boom");
  });

  it("rejects if spawn emits 'error' before close", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const promise = runHarness({ command: baseCommand, spawn });
    child.emit("error", new Error("ENOENT: no such binary"));
    await expect(promise).rejects.toThrow(/ENOENT/);
  });

  it("kills the child when the abort signal fires", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const controller = new AbortController();
    const promise = runHarness({
      command: baseCommand,
      spawn,
      signal: controller.signal,
    });
    controller.abort();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    const result = await promise;
    expect(result.signal).toBe("SIGTERM");
  });

  it("kills immediately if the abort signal was already aborted before spawn", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const controller = new AbortController();
    controller.abort();
    const promise = runHarness({
      command: baseCommand,
      spawn,
      signal: controller.signal,
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await promise;
  });

  it("preserves the signal in the result when the child exits on one", async () => {
    const child = makeFakeChild();
    const spawn: HarnessSpawnFn = () => child as unknown as ReturnType<HarnessSpawnFn>;
    const promise = runHarness({ command: baseCommand, spawn });
    child.emit("close", null, "SIGKILL");
    const result = await promise;
    expect(result).toEqual({
      exitCode: null,
      signal: "SIGKILL",
      stdout: "",
      stderr: "",
    });
  });
});
