import { describe, expect, it, vi } from "vitest";
import { executeAcpTurn } from "./acpxTurn";

type FakeEvent =
  | { type: "text_delta"; text: string; stream?: "output" | "thought" }
  | { type: "tool_call"; text: string }
  | { type: "status"; text: string; used?: number; size?: number };

async function* asyncEvents(events: FakeEvent[]): AsyncGenerator<FakeEvent, void, unknown> {
  for (const event of events) yield event;
}

function createFakeRuntime(events: FakeEvent[]) {
  const calls: {
    ensureSession: unknown[];
    startTurn: unknown[];
    close: unknown[];
  } = { ensureSession: [], startTurn: [], close: [] };
  const handle = {
    sessionKey: "ada:kid:s1:claude",
    backend: "acpx",
    runtimeSessionName: "runtime-session",
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
        result: Promise.resolve({ status: "completed" as const }),
        cancel: vi.fn(async () => {}),
        closeStream: vi.fn(async () => {}),
      };
    }),
    close: vi.fn(async (input: unknown) => {
      calls.close.push(input);
    }),
  };
  return { runtime, calls, handle };
}

describe("executeAcpTurn", () => {
  it("creates a read-only ACPX runtime and submits a persistent prompt turn", async () => {
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
        permissionMode: "approve-reads",
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
