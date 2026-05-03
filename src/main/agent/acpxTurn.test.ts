import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AcpRuntimeTurnResult } from "acpx/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAcpTurn } from "./acpxTurn";

type FakeEvent =
  | { type: "text_delta"; text: string; stream?: "output" | "thought" }
  | { type: "tool_call"; text: string }
  | { type: "status"; text: string; used?: number; size?: number };

async function* asyncEvents(events: FakeEvent[]): AsyncGenerator<FakeEvent, void, unknown> {
  for (const event of events) yield event;
}

function createFakeRuntime(
  events: FakeEvent[],
  options: {
    close?: (input: unknown) => Promise<void>;
    result?: Promise<AcpRuntimeTurnResult>;
  } = {},
) {
  const calls: {
    ensureSession: unknown[];
    startTurn: unknown[];
    close: unknown[];
  } = { ensureSession: [], startTurn: [], close: [] };
  const handle = {
    sessionKey: "ada:kid:s1:claude",
    backend: "acpx",
    runtimeSessionName: "runtime-session",
    acpxRecordId: "ada:kid:s1:claude",
  };
  const runtime = {
    ensureSession: vi.fn(async (input: unknown) => {
      calls.ensureSession.push(input);
      return handle;
    }),
    startTurn: vi.fn((input: unknown) => {
      calls.startTurn.push(input);
      return {
        requestId: (input as { requestId: string }).requestId,
        events: asyncEvents(events),
        result: options.result ?? Promise.resolve({ status: "completed" as const }),
        cancel: vi.fn(async () => {}),
        closeStream: vi.fn(async () => {}),
      };
    }),
    close: vi.fn(async (input: unknown) => {
      calls.close.push(input);
      await options.close?.(input);
    }),
  };
  return { runtime, calls, handle };
}

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hibit-acpx-turn-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("executeAcpTurn", () => {
  it("creates an approve-all ACPX runtime and submits a persistent prompt turn", async () => {
    const { runtime, calls, handle } = createFakeRuntime([
      { type: "text_delta", text: "Hi " },
      { type: "text_delta", text: "Ada." },
    ]);
    const runtimeFactory = vi.fn(() => runtime);

    const result = await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir: "/profiles/ada/.acpx-sessions",
      prompt: "hello",
      runtimeFactory,
    });

    expect(runtimeFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/profiles/ada",
        permissionMode: "approve-all",
        nonInteractivePermissions: "deny",
      }),
    );
    expect(calls.ensureSession).toEqual([
      {
        sessionKey: "ada:kid:s1:claude",
        agent: "claude",
        mode: "persistent",
        cwd: "/profiles/ada",
      },
    ]);
    expect(calls.startTurn[0]).toMatchObject({
      handle,
      text: "hello",
      mode: "prompt",
    });
    expect(result).toEqual({
      status: "completed",
      text: "Hi Ada.",
      usage: null,
    });
  });

  it("closes the runtime handle after consuming the turn", async () => {
    const { runtime, calls, handle } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir: "/profiles/ada/.acpx-sessions",
      prompt: "hello",
      runtimeFactory: () => runtime,
    });

    expect(calls.close).toEqual([
      {
        handle,
        reason: "turn complete",
        discardPersistentState: false,
      },
    ]);
  });

  it("can discard persistent state after helper turns", async () => {
    const { runtime, calls, handle } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:cursor-marker:claude",
      cwd: "/profiles/ada",
      stateDir: "/profiles/ada/.acpx-sessions",
      prompt: "hello",
      discardPersistentState: true,
      runtimeFactory: () => runtime,
    });

    expect(calls.close).toEqual([
      {
        handle,
        reason: "turn complete",
        discardPersistentState: true,
      },
    ]);
  });

  it("returns a completed turn when runtime close fails after success", async () => {
    const { runtime } = createFakeRuntime([{ type: "text_delta", text: "Done." }], {
      close: async () => {
        throw new Error("close unsupported");
      },
    });

    const result = await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:cursor-marker:claude",
      cwd: "/profiles/ada",
      stateDir: "/profiles/ada/.acpx-sessions",
      prompt: "hello",
      discardPersistentState: true,
      runtimeFactory: () => runtime,
    });

    expect(result).toEqual({ status: "completed", text: "Done.", usage: null });
  });

  it("removes local discarded session state when runtime close fails", async () => {
    const stateDir = await createTempDir();
    const sessionRecordPath = join(
      stateDir,
      "sessions",
      `${encodeURIComponent("ada:kid:s1:claude")}.json`,
    );
    await mkdir(join(stateDir, "sessions"), { recursive: true });
    await writeFile(sessionRecordPath, "{}\n", "utf8");
    const { runtime } = createFakeRuntime([{ type: "text_delta", text: "Done." }], {
      close: async () => {
        throw new Error("close unsupported");
      },
    });

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:cursor-marker:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      discardPersistentState: true,
      runtimeFactory: () => runtime,
    });

    await expect(readFile(sessionRecordPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns a failed turn when runtime close fails after agent failure", async () => {
    const { runtime } = createFakeRuntime([{ type: "text_delta", text: "Nope." }], {
      result: Promise.resolve({ status: "failed" as const, error: { message: "agent failed" } }),
      close: async () => {
        throw new Error("close unsupported");
      },
    });

    const result = await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:cursor-marker:claude",
      cwd: "/profiles/ada",
      stateDir: "/profiles/ada/.acpx-sessions",
      prompt: "hello",
      discardPersistentState: true,
      runtimeFactory: () => runtime,
    });

    expect(result).toEqual({
      status: "failed",
      text: "Nope.",
      usage: null,
      error: "agent failed",
    });
  });

  it("streams only visible output text to onDelta", async () => {
    const { runtime } = createFakeRuntime([
      { type: "text_delta", text: "thinking", stream: "thought" },
      { type: "tool_call", text: "read file" },
      { type: "status", text: "usage", used: 20, size: 100 },
      { type: "text_delta", text: "Visible " },
      { type: "text_delta", text: "reply." },
    ]);
    const onDelta = vi.fn();

    const result = await executeAcpTurn({
      agent: "codex",
      sessionKey: "ada:kid:s1:codex",
      cwd: "/profiles/ada",
      stateDir: "/profiles/ada/.acpx-sessions",
      prompt: "hello",
      onDelta,
      runtimeFactory: () => runtime,
    });

    expect(onDelta.mock.calls.map((args) => args[0])).toEqual(["Visible ", "reply."]);
    expect(result.text).toBe("Visible reply.");
    expect(result.usage).toEqual({
      inputTokens: 20,
      outputTokens: expect.any(Number),
      estimated: false,
    });
  });
});
