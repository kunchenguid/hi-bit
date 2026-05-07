import type { SendMessageResult } from "@shared/chat";
import type { TranscriptEvent } from "@shared/transcript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canRetryLastParentMessage, useParentChatStore } from "./parentChatStore";

type HiBitApi = typeof window.hibit;

function mockHiBit(partial: Partial<HiBitApi>): void {
  (globalThis as unknown as { window: { hibit: HiBitApi } }).window = {
    hibit: {
      getAppInfo: vi.fn(),
      listProfiles: vi.fn(),
      createProfile: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

beforeEach(() => {
  useParentChatStore.setState({
    messages: [],
    status: "idle",
    error: null,
    hydrateStatus: "idle",
    hydrateError: null,
    hydratedSessionId: null,
  });
});

describe("useParentChatStore", () => {
  it("appends a parent message and a bit reply on success", async () => {
    const result: SendMessageResult = { ok: true, text: "got it", durationMs: 42 };
    const sendParentMessage = vi.fn().mockResolvedValue(result);
    mockHiBit({ sendParentMessage });

    const promise = useParentChatStore.getState().send("ada", "focus on loops");
    expect(useParentChatStore.getState().status).toBe("sending");
    expect(useParentChatStore.getState().messages).toHaveLength(1);
    expect(useParentChatStore.getState().messages[0]).toMatchObject({
      role: "parent",
      text: "focus on loops",
    });
    await promise;

    const state = useParentChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "text", text: "got it" });
    expect(sendParentMessage).toHaveBeenCalledWith("ada", "focus on loops");
  });

  it("trims trailing whitespace from live parent-mode bit replies", async () => {
    const result: SendMessageResult = { ok: true, text: "got it\n\n  ", durationMs: 42 };
    mockHiBit({ sendParentMessage: vi.fn().mockResolvedValue(result) });

    await useParentChatStore.getState().send("ada", "focus on loops");

    expect(useParentChatStore.getState().messages[1]).toMatchObject({
      role: "bit",
      kind: "text",
      text: "got it",
    });
  });

  it("surfaces the raw error text to the parent on ok=false", async () => {
    const result: SendMessageResult = { ok: false, error: "harness crashed", durationMs: 10 };
    mockHiBit({ sendParentMessage: vi.fn().mockResolvedValue(result) });

    await useParentChatStore.getState().send("ada", "hi");
    const state = useParentChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.error).toBe("harness crashed");
    expect(state.messages[1]).toMatchObject({
      role: "bit",
      kind: "error",
      text: "harness crashed",
    });
  });

  it("rejects an empty prompt without calling IPC", async () => {
    const sendParentMessage = vi.fn();
    mockHiBit({ sendParentMessage });
    await useParentChatStore.getState().send("ada", "   ");
    expect(sendParentMessage).not.toHaveBeenCalled();
    expect(useParentChatStore.getState().messages).toEqual([]);
  });

  it("trims the prompt before sending", async () => {
    const sendParentMessage = vi.fn().mockResolvedValue({ ok: true, text: "ok", durationMs: 1 });
    mockHiBit({ sendParentMessage });
    await useParentChatStore.getState().send("ada", "  focus on css  ");
    expect(sendParentMessage).toHaveBeenCalledWith("ada", "focus on css");
    expect(useParentChatStore.getState().messages[0].text).toBe("focus on css");
  });

  it("surfaces a thrown IPC error as an error bubble with the raw message", async () => {
    mockHiBit({
      sendParentMessage: vi.fn().mockRejectedValue(new Error("ipc exploded")),
    });
    await useParentChatStore.getState().send("ada", "hello");
    const state = useParentChatStore.getState();
    expect(state.error).toBe("ipc exploded");
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error", text: "ipc exploded" });
  });

  it("reset clears messages, status, error, and hydrate state", () => {
    useParentChatStore.setState({
      messages: [{ id: "m1", role: "parent", kind: "text", text: "x", timestamp: "t" }],
      status: "idle",
      error: "err",
      hydrateStatus: "ready",
      hydrateError: "stale",
      hydratedSessionId: "sess-1",
    });
    useParentChatStore.getState().reset();
    const state = useParentChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.hydrateStatus).toBe("idle");
    expect(state.hydrateError).toBeNull();
    expect(state.hydratedSessionId).toBeNull();
  });

  it("hydrate populates messages from the persisted parent transcript", async () => {
    const transcript: TranscriptEvent[] = [
      {
        timestamp: "t1",
        role: "parent",
        sessionId: "sess-1",
        kind: "user_message",
        text: "focus on loops",
      },
      {
        timestamp: "t2",
        role: "parent",
        sessionId: "sess-1",
        kind: "assistant_message",
        text: "got it",
      },
    ];
    const getTranscript = vi.fn().mockResolvedValue(transcript);
    mockHiBit({ getTranscript });

    await useParentChatStore.getState().hydrate("ada", "sess-1");

    const state = useParentChatStore.getState();
    expect(getTranscript).toHaveBeenCalledWith("ada", "sess-1");
    expect(state.hydrateStatus).toBe("ready");
    expect(state.hydratedSessionId).toBe("sess-1");
    expect(state.messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      "parent:focus on loops",
      "bit:got it",
    ]);
  });

  it("trims trailing whitespace from hydrated parent-mode bit replies", async () => {
    const transcript: TranscriptEvent[] = [
      {
        timestamp: "t2",
        role: "parent",
        sessionId: "sess-1",
        kind: "assistant_message",
        text: "got it\n\n  ",
      },
    ];
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue(transcript) });

    await useParentChatStore.getState().hydrate("ada", "sess-1");

    expect(useParentChatStore.getState().messages[0]).toMatchObject({
      role: "bit",
      kind: "text",
      text: "got it",
    });
  });

  it("hydrate records the error when the IPC rejects", async () => {
    mockHiBit({ getTranscript: vi.fn().mockRejectedValue(new Error("disk gone")) });
    await useParentChatStore.getState().hydrate("ada", "sess-1");
    const state = useParentChatStore.getState();
    expect(state.hydrateStatus).toBe("error");
    expect(state.hydrateError).toBe("disk gone");
    expect(state.messages).toEqual([]);
    expect(state.hydratedSessionId).toBeNull();
  });

  it("hydrate replaces prior messages when switching sessions", async () => {
    useParentChatStore.setState({
      messages: [{ id: "old", role: "parent", kind: "text", text: "old msg", timestamp: "t0" }],
      hydratedSessionId: "sess-0",
      hydrateStatus: "ready",
    });
    mockHiBit({
      getTranscript: vi.fn().mockResolvedValue([
        {
          timestamp: "t1",
          role: "parent",
          sessionId: "sess-1",
          kind: "user_message",
          text: "new msg",
        },
      ]),
    });
    await useParentChatStore.getState().hydrate("ada", "sess-1");
    const state = useParentChatStore.getState();
    expect(state.messages.map((m) => m.text)).toEqual(["new msg"]);
    expect(state.hydratedSessionId).toBe("sess-1");
  });

  it("canRetryLastParentMessage is true only when the last bit bubble is an error after a parent turn", () => {
    expect(canRetryLastParentMessage([])).toBe(false);
    expect(
      canRetryLastParentMessage([
        { id: "1", role: "parent", kind: "text", text: "hi", timestamp: "t" },
      ]),
    ).toBe(false);
    expect(
      canRetryLastParentMessage([
        { id: "1", role: "parent", kind: "text", text: "hi", timestamp: "t1" },
        { id: "2", role: "bit", kind: "text", text: "ok", timestamp: "t2" },
      ]),
    ).toBe(false);
    expect(
      canRetryLastParentMessage([
        { id: "1", role: "parent", kind: "text", text: "hi", timestamp: "t1" },
        { id: "2", role: "bit", kind: "error", text: "boom", timestamp: "t2" },
      ]),
    ).toBe(true);
  });

  it("retry resends the last parent prompt and replaces the error bubble on success", async () => {
    const sendParentMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom", durationMs: 1 })
      .mockResolvedValueOnce({ ok: true, text: "got it", durationMs: 2 });
    mockHiBit({ sendParentMessage });

    await useParentChatStore.getState().send("ada", "focus on loops");
    expect(useParentChatStore.getState().messages.map((m) => m.kind)).toEqual(["text", "error"]);

    await useParentChatStore.getState().retry("ada");

    expect(sendParentMessage).toHaveBeenNthCalledWith(2, "ada", "focus on loops");
    const state = useParentChatStore.getState();
    expect(state.messages.map((m) => `${m.role}:${m.kind}:${m.text}`)).toEqual([
      "parent:text:focus on loops",
      "bit:text:got it",
    ]);
    expect(state.error).toBeNull();
  });

  it("retry replaces the error bubble with a fresh error bubble on continued failure", async () => {
    const sendParentMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom", durationMs: 1 })
      .mockResolvedValueOnce({ ok: false, error: "boom again", durationMs: 1 });
    mockHiBit({ sendParentMessage });

    await useParentChatStore.getState().send("ada", "hi");
    await useParentChatStore.getState().retry("ada");

    const state = useParentChatStore.getState();
    expect(sendParentMessage).toHaveBeenCalledTimes(2);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error", text: "boom again" });
    expect(state.error).toBe("boom again");
  });

  it("retry is a no-op when the last bit bubble is a successful reply", async () => {
    const sendParentMessage = vi.fn().mockResolvedValue({ ok: true, text: "ok", durationMs: 1 });
    mockHiBit({ sendParentMessage });

    await useParentChatStore.getState().send("ada", "hi");
    await useParentChatStore.getState().retry("ada");

    expect(sendParentMessage).toHaveBeenCalledTimes(1);
  });

  it("retry is a no-op when no messages exist yet", async () => {
    const sendParentMessage = vi.fn();
    mockHiBit({ sendParentMessage });

    const result = await useParentChatStore.getState().retry("ada");
    expect(result).toBeNull();
    expect(sendParentMessage).not.toHaveBeenCalled();
  });

  it("retry is a no-op while a send is already in flight", async () => {
    const sendParentMessage = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "boom", durationMs: 1 });
    mockHiBit({ sendParentMessage });

    await useParentChatStore.getState().send("ada", "hi");
    useParentChatStore.setState({ status: "sending" });

    const result = await useParentChatStore.getState().retry("ada");
    expect(result).toBeNull();
    expect(sendParentMessage).toHaveBeenCalledTimes(1);
  });

  it("retry surfaces a thrown IPC error as an error bubble with the raw message", async () => {
    const sendParentMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom", durationMs: 1 })
      .mockRejectedValueOnce(new Error("ipc exploded"));
    mockHiBit({ sendParentMessage });

    await useParentChatStore.getState().send("ada", "hi");
    await useParentChatStore.getState().retry("ada");

    const state = useParentChatStore.getState();
    expect(state.error).toBe("ipc exploded");
    expect(state.messages[1]).toMatchObject({
      role: "bit",
      kind: "error",
      text: "ipc exploded",
    });
  });

  it("ignores a second send while one is in flight", async () => {
    let resolveSend: (v: SendMessageResult) => void = () => {};
    const pending = new Promise<SendMessageResult>((r) => {
      resolveSend = r;
    });
    const sendParentMessage = vi.fn().mockReturnValue(pending);
    mockHiBit({ sendParentMessage });

    const p1 = useParentChatStore.getState().send("ada", "first");
    const p2 = useParentChatStore.getState().send("ada", "second");
    expect(useParentChatStore.getState().messages.map((m) => m.text)).toEqual(["first"]);
    expect(sendParentMessage).toHaveBeenCalledTimes(1);

    resolveSend({ ok: true, text: "response", durationMs: 10 });
    await Promise.all([p1, p2]);
    expect(useParentChatStore.getState().messages).toHaveLength(2);
    expect(useParentChatStore.getState().messages[1].text).toBe("response");
  });
});
