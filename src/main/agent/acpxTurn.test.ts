import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AcpRuntimeOptions, AcpRuntimeTurnResult } from "acpx/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAcpRuntimeSessions, closeAllAcpRuntimes, executeAcpTurn } from "./acpxTurn";

type FakeEvent =
  | { type: "text_delta"; text: string; stream?: "output" | "thought" }
  | { type: "tool_call"; text: string }
  | { type: "status"; text: string; tag?: string; used?: number; size?: number };

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
    setConfigOption: unknown[];
    startTurn: unknown[];
    close: unknown[];
  } = { ensureSession: [], setConfigOption: [], startTurn: [], close: [] };
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
    setConfigOption: vi.fn(async (input: unknown) => {
      calls.setConfigOption.push(input);
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
    const stateDir = await createTempDir();
    const { runtime, calls, handle } = createFakeRuntime([
      { type: "text_delta", text: "Hi " },
      { type: "text_delta", text: "Ada." },
    ]);
    const runtimeFactory = vi.fn((_: AcpRuntimeOptions) => runtime);

    const result = await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
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
    const runtimeOptions = runtimeFactory.mock.calls[0][0];
    expect(runtimeOptions.agentRegistry.resolve("claude")).toContain(
      "clean-acp-agent-launcher.cjs",
    );
    expect(runtimeOptions.agentRegistry.resolve("claude")).toContain("claude.json");
    expect(calls.ensureSession).toEqual([
      {
        sessionKey: "ada:kid:s1:claude",
        agent: "claude",
        mode: "persistent",
        cwd: "/profiles/ada",
      },
    ]);
    expect(calls.setConfigOption).toEqual([{ handle, key: "effort", value: "low" }]);
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

  it("continues the turn when low-effort config is unsupported", async () => {
    const stateDir = await createTempDir();
    const { runtime, calls, handle } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);
    runtime.setConfigOption.mockImplementationOnce(async (input: unknown) => {
      calls.setConfigOption.push(input);
      throw new Error("unknown config option");
    });

    const result = await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      runtimeFactory: () => runtime,
    });

    expect(calls.setConfigOption).toEqual([{ handle, key: "effort", value: "low" }]);
    expect(calls.startTurn[0]).toMatchObject({ handle, text: "hello" });
    expect(result).toEqual({ status: "completed", text: "Done.", usage: null });
  });

  it("uses clean provider launch specs for built-in agents", async () => {
    const stateDir = await createTempDir();
    const { runtime } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);
    const runtimeFactory = vi.fn((_: AcpRuntimeOptions) => runtime);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      runtimeFactory,
    });

    const agentRegistry = runtimeFactory.mock.calls[0][0].agentRegistry;
    const claudeSpec = JSON.parse(
      await readFile(join(stateDir, "clean-agent-launch", "claude.json"), "utf8"),
    );
    const codexSpec = JSON.parse(
      await readFile(join(stateDir, "clean-agent-launch", "codex.json"), "utf8"),
    );
    const opencodeSpec = JSON.parse(
      await readFile(join(stateDir, "clean-agent-launch", "opencode.json"), "utf8"),
    );

    expect(agentRegistry.resolve("claude")).toContain("clean-acp-agent-launcher.cjs");
    expect(claudeSpec.env.CLAUDE_CODE_EXECUTABLE).toBe(
      join(stateDir, "clean-agent-launch", "clean-claude-code.cjs"),
    );
    expect(claudeSpec.env).not.toHaveProperty("CLAUDE_CONFIG_DIR");
    expect(codexSpec.args).toContain("ignore_user_config=true");
    expect(opencodeSpec.env.XDG_CONFIG_HOME).toBe(
      join(stateDir, "clean-agent-config", "xdg-config"),
    );
    expect(opencodeSpec.args).toContain("--pure");
  });

  it("keeps the runtime handle alive after consuming a regular turn", async () => {
    const stateDir = await createTempDir();
    const { runtime, calls } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      runtimeFactory: () => runtime,
    });

    expect(calls.close).toEqual([]);
  });

  it("reuses the warm runtime handle for later regular turns in the same session", async () => {
    const stateDir = await createTempDir();
    const { runtime, calls, handle } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);
    const runtimeFactory = vi.fn((_: AcpRuntimeOptions) => runtime);
    const options = {
      agent: "claude" as const,
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      runtimeFactory,
    };

    await executeAcpTurn({ ...options, prompt: "first" });
    await executeAcpTurn({ ...options, prompt: "second" });

    expect(runtimeFactory).toHaveBeenCalledTimes(1);
    expect(calls.ensureSession).toHaveLength(1);
    expect(calls.startTurn).toHaveLength(2);
    expect(calls.startTurn[1]).toMatchObject({ handle, text: "second" });
    expect(calls.close).toEqual([]);
  });

  it("evicts and closes a warm runtime when a regular turn throws", async () => {
    const stateDir = await createTempDir();
    const broken = createFakeRuntime([]);
    broken.runtime.startTurn.mockImplementationOnce(() => {
      throw new Error("runtime disconnected");
    });
    const recovered = createFakeRuntime([{ type: "text_delta", text: "Recovered." }]);
    const runtimeFactory = vi
      .fn((_: AcpRuntimeOptions) => broken.runtime)
      .mockImplementationOnce((_: AcpRuntimeOptions) => broken.runtime)
      .mockImplementationOnce((_: AcpRuntimeOptions) => recovered.runtime);
    const options = {
      agent: "claude" as const,
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      runtimeFactory,
    };

    await expect(executeAcpTurn({ ...options, prompt: "first" })).rejects.toThrow(
      "runtime disconnected",
    );
    const result = await executeAcpTurn({ ...options, prompt: "second" });

    expect(broken.calls.close).toEqual([
      {
        handle: broken.handle,
        reason: "turn failed",
        discardPersistentState: false,
      },
    ]);
    expect(runtimeFactory).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: "completed", text: "Recovered.", usage: null });
  });

  it("closes warm runtime handles when their Hi-Bit session ends", async () => {
    const stateDir = await createTempDir();
    const { runtime, calls, handle } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      runtimeFactory: () => runtime,
    });

    await closeAcpRuntimeSessions({ profileId: "ada", role: "kid", sessionId: "s1" });

    expect(calls.close).toEqual([
      {
        handle,
        reason: "Hi-Bit session ended",
        discardPersistentState: false,
      },
    ]);
  });

  it("ignores warm runtime startup failures while closing a Hi-Bit session", async () => {
    const stateDir = await createTempDir();
    let rejectEnsureSession: (err: Error) => void = () => {};
    const runtime = {
      ensureSession: vi.fn(
        () =>
          new Promise<never>((_, reject) => {
            rejectEnsureSession = reject;
          }),
      ),
      startTurn: vi.fn(),
      close: vi.fn(),
    };
    const turnPromise = executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      runtimeFactory: () => runtime,
    });
    turnPromise.catch(() => {});
    await vi.waitFor(() => expect(runtime.ensureSession).toHaveBeenCalled());

    const closePromise = closeAcpRuntimeSessions({ profileId: "ada", role: "kid", sessionId: "s1" });
    rejectEnsureSession(new Error("spawn failed"));

    await expect(closePromise).resolves.toBeUndefined();
    await expect(turnPromise).rejects.toThrow("Failed to start claude through ACPX: spawn failed");
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("closes every warm runtime handle on app shutdown", async () => {
    const stateDir = await createTempDir();
    const first = createFakeRuntime([{ type: "text_delta", text: "One." }]);
    const second = createFakeRuntime([{ type: "text_delta", text: "Two." }]);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:s1:claude",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      runtimeFactory: () => first.runtime,
    });
    await executeAcpTurn({
      agent: "claude",
      sessionKey: "bea:kid:s1:claude",
      cwd: "/profiles/bea",
      stateDir,
      prompt: "hello",
      runtimeFactory: () => second.runtime,
    });

    await closeAllAcpRuntimes("app quit");

    expect(first.calls.close).toEqual([
      {
        handle: first.handle,
        reason: "app quit",
        discardPersistentState: false,
      },
    ]);
    expect(second.calls.close).toEqual([
      {
        handle: second.handle,
        reason: "app quit",
        discardPersistentState: false,
      },
    ]);
  });

  it("can discard persistent state after helper turns", async () => {
    const stateDir = await createTempDir();
    const { runtime, calls, handle } = createFakeRuntime([{ type: "text_delta", text: "Done." }]);

    await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:cursor-marker:claude",
      cwd: "/profiles/ada",
      stateDir,
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
    const stateDir = await createTempDir();
    const { runtime } = createFakeRuntime([{ type: "text_delta", text: "Done." }], {
      close: async () => {
        throw new Error("close unsupported");
      },
    });

    const result = await executeAcpTurn({
      agent: "claude",
      sessionKey: "ada:kid:cursor-marker:claude",
      cwd: "/profiles/ada",
      stateDir,
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
    const stateDir = await createTempDir();
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
      stateDir,
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

  it("adds agent context when ACPX cannot start the selected agent", async () => {
    const stateDir = await createTempDir();
    const runtime = {
      ensureSession: vi.fn(async () => {
        throw new Error("spawn npx ENOENT");
      }),
      startTurn: vi.fn(),
      close: vi.fn(),
    };

    await expect(
      executeAcpTurn({
        agent: "claude",
        sessionKey: "ada:kid:s1:claude",
        cwd: "/profiles/ada",
        stateDir,
        prompt: "hello",
        runtimeFactory: () => runtime,
      }),
    ).rejects.toThrow("Failed to start claude through ACPX: spawn npx ENOENT");
  });

  it("streams only visible output text to onDelta", async () => {
    const stateDir = await createTempDir();
    const { runtime } = createFakeRuntime([
      { type: "text_delta", text: "thinking", stream: "thought" },
      { type: "tool_call", text: "read file" },
      { type: "status", text: "usage", tag: "usage_update", used: 20, size: 100 },
      { type: "text_delta", text: "Visible " },
      { type: "text_delta", text: "reply." },
    ]);
    const onDelta = vi.fn();

    const result = await executeAcpTurn({
      agent: "codex",
      sessionKey: "ada:kid:s1:codex",
      cwd: "/profiles/ada",
      stateDir,
      prompt: "hello",
      onDelta,
      runtimeFactory: () => runtime,
    });

    expect(onDelta.mock.calls.map((args) => args[0])).toEqual(["Visible ", "reply."]);
    expect(result.text).toBe("Visible reply.");
    expect(result.usage).toEqual({
      contextTokensUsed: 20,
      contextTokensSize: 100,
    });
  });
});
