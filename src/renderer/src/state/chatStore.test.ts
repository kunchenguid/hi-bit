import type { SendMessageResult } from "@shared/chat";
import { emptyProgress } from "@shared/progress";
import type { TranscriptEvent } from "@shared/transcript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canRetryLastKidMessage,
  KID_EMPTY_REPLY,
  KID_REPLY_TIMEOUT_MS,
  useChatStore,
} from "./chatStore";
import { useProgressStore } from "./progressStore";

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
  vi.useRealTimers();
  useChatStore.setState({
    messages: [],
    status: "idle",
    error: null,
    hydrateStatus: "idle",
    hydrateError: null,
    hydratedSessionId: null,
    greetingForSessionId: null,
    streamingText: null,
    activeRequestId: null,
  });
  useProgressStore.setState({
    progress: null,
    profileId: null,
    status: "idle",
    error: null,
    updateError: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useChatStore", () => {
  it("appends a kid message, a bit reply, and returns ok on success", async () => {
    const result: SendMessageResult = { ok: true, text: "hi Ada!", durationMs: 123 };
    mockHiBit({ sendKidMessage: vi.fn().mockResolvedValue(result) });

    const promise = useChatStore.getState().send("ada", "hello");
    expect(useChatStore.getState().status).toBe("sending");
    expect(useChatStore.getState().messages.length).toBe(1);
    expect(useChatStore.getState().messages[0]).toMatchObject({ role: "kid", text: "hello" });
    await promise;

    const state = useChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", text: "hi Ada!", kind: "text" });
  });

  it("refreshes loaded progress after a successful kid turn", async () => {
    const result: SendMessageResult = { ok: true, text: "next step", durationMs: 123 };
    const refreshed = {
      ...emptyProgress(),
      knowledgePoints: {
        "html-doc-shell": {
          status: "saw_it" as const,
          firstSeenAt: "2026-04-29T00:00:00.000Z",
          updatedAt: "2026-04-29T00:00:00.000Z",
        },
      },
    };
    const getProgress = vi.fn().mockResolvedValue(refreshed);
    mockHiBit({ sendKidMessage: vi.fn().mockResolvedValue(result), getProgress });
    useProgressStore.setState({ status: "ready", profileId: "ada", progress: emptyProgress() });

    await useChatStore.getState().send("ada", "hello");

    expect(getProgress).toHaveBeenCalledWith("ada");
    expect(useProgressStore.getState().progress).toEqual(refreshed);
  });

  it("sendSystemPrompt prompts Bit without showing the prompt as a kid message", async () => {
    const sendKidMessage = vi
      .fn()
      .mockResolvedValue({ ok: true, text: "Nice. Add a color next.", durationMs: 5 });
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().sendSystemPrompt("ada", {
      prompt: "The kid saved index.html. Diff: +<button>Go</button>",
      label: "Saved index.html",
    });

    expect(sendKidMessage).toHaveBeenCalledWith(
      "ada",
      "The kid saved index.html. Diff: +<button>Go</button>",
      expect.any(String),
    );
    expect(useChatStore.getState().messages.map((m) => [m.role, m.kind, m.text])).toEqual([
      ["system", "divider", "Saved index.html"],
      ["bit", "text", "Nice. Add a color next."],
    ]);
  });

  it("shows a kid-friendly error bubble and records the raw error on ok=false", async () => {
    const result: SendMessageResult = { ok: false, error: "boom", durationMs: 50 };
    mockHiBit({ sendKidMessage: vi.fn().mockResolvedValue(result) });

    await useChatStore.getState().send("ada", "hello");
    const state = useChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.error).toBe("boom");
    expect(state.messages.length).toBe(2);
    expect(state.messages[0]).toMatchObject({ role: "kid", text: "hello" });
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error" });
    expect(state.messages[1].text).toMatch(/snack/i);
  });

  it("converts a blank ok=true reply into a retryable empty-reply error bubble", async () => {
    const result: SendMessageResult = { ok: true, text: "\n", durationMs: 12 };
    mockHiBit({ sendKidMessage: vi.fn().mockResolvedValue(result) });

    await useChatStore.getState().send("ada", "hello");
    const state = useChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.error).toBe("Bit returned an empty reply");
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error", text: KID_EMPTY_REPLY });
    expect(canRetryLastKidMessage(state.messages)).toBe(true);
  });

  it("treats whitespace-only ok=true replies as empty as well", async () => {
    const result: SendMessageResult = { ok: true, text: "   \t  \n", durationMs: 1 };
    mockHiBit({ sendKidMessage: vi.fn().mockResolvedValue(result) });

    await useChatStore.getState().send("ada", "hello");
    const state = useChatStore.getState();
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error", text: KID_EMPTY_REPLY });
  });

  it("retry surfaces an empty reply as an error bubble that stays retryable", async () => {
    const sendKidMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom", durationMs: 1 })
      .mockResolvedValueOnce({ ok: true, text: "\n", durationMs: 1 });
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().send("ada", "hello");
    await useChatStore.getState().retry("ada");

    const state = useChatStore.getState();
    expect(sendKidMessage).toHaveBeenCalledTimes(2);
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error", text: KID_EMPTY_REPLY });
    expect(canRetryLastKidMessage(state.messages)).toBe(true);
  });

  it("rejects an empty prompt without calling IPC", async () => {
    const sendKidMessage = vi.fn();
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().send("ada", "   ");
    expect(sendKidMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("trims the prompt before sending", async () => {
    const sendKidMessage = vi.fn().mockResolvedValue({ ok: true, text: "ok", durationMs: 1 });
    mockHiBit({ sendKidMessage });
    await useChatStore.getState().send("ada", "  hello  ");
    expect(sendKidMessage).toHaveBeenCalledWith("ada", "hello", expect.any(String));
    expect(useChatStore.getState().messages[0].text).toBe("hello");
  });

  it("surfaces a thrown IPC error as a calm bubble plus raw error state", async () => {
    mockHiBit({ sendKidMessage: vi.fn().mockRejectedValue(new Error("ipc blew up")) });

    await useChatStore.getState().send("ada", "hello");
    const state = useChatStore.getState();
    expect(state.error).toBe("ipc blew up");
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error" });
  });

  it("times out a stuck harness turn and returns the input to idle", async () => {
    vi.useFakeTimers();
    const cancelKidMessage = vi.fn().mockResolvedValue(undefined);
    mockHiBit({
      sendKidMessage: vi.fn(() => new Promise<SendMessageResult>(() => {})),
      cancelKidMessage,
    });

    const sendPromise = useChatStore.getState().send("ada", "ready");
    const requestId = useChatStore.getState().activeRequestId;
    expect(requestId).toEqual(expect.any(String));
    expect(useChatStore.getState().status).toBe("sending");

    await vi.advanceTimersByTimeAsync(KID_REPLY_TIMEOUT_MS);
    await sendPromise;

    const state = useChatStore.getState();
    expect(cancelKidMessage).toHaveBeenCalledWith(requestId);
    expect(state.status).toBe("idle");
    expect(state.error).toMatch(/timed out/i);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error" });
    expect(canRetryLastKidMessage(state.messages)).toBe(true);
    expect(state.activeRequestId).toBeNull();
  });

  it("keeps retry disabled until cancellation is acknowledged after timeout", async () => {
    vi.useFakeTimers();
    let resolveCancel: () => void = () => {};
    const cancelKidMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve;
        }),
    );
    const sendKidMessage = vi.fn(() => new Promise<SendMessageResult>(() => {}));
    mockHiBit({ sendKidMessage, cancelKidMessage });

    const sendPromise = useChatStore.getState().send("ada", "ready");
    const requestId = useChatStore.getState().activeRequestId;

    await vi.advanceTimersByTimeAsync(KID_REPLY_TIMEOUT_MS);

    expect(cancelKidMessage).toHaveBeenCalledWith(requestId);
    expect(useChatStore.getState().status).toBe("sending");
    await useChatStore.getState().retry("ada");
    expect(sendKidMessage).toHaveBeenCalledTimes(1);

    resolveCancel();
    await sendPromise;

    const state = useChatStore.getState();
    expect(state.status).toBe("idle");
    expect(state.error).toMatch(/timed out/i);
    expect(state.activeRequestId).toBeNull();
  });

  it("returns to idle when cancellation IPC hangs past the acknowledgement window", async () => {
    vi.useFakeTimers();
    const cancelKidMessage = vi.fn(() => new Promise<void>(() => {}));
    mockHiBit({
      sendKidMessage: vi.fn(() => new Promise<SendMessageResult>(() => {})),
      cancelKidMessage,
    });

    const sendPromise = useChatStore.getState().send("ada", "ready");
    const requestId = useChatStore.getState().activeRequestId;

    await vi.advanceTimersByTimeAsync(KID_REPLY_TIMEOUT_MS);

    expect(cancelKidMessage).toHaveBeenCalledWith(requestId);
    expect(useChatStore.getState().status).toBe("sending");

    await vi.advanceTimersByTimeAsync(3_000);
    await sendPromise;

    expect(useChatStore.getState().status).toBe("idle");
    expect(useChatStore.getState().error).toMatch(/timed out/i);
  });

  it("ignores streaming deltas that do not match the active kid turn", async () => {
    let resolveSend: (v: SendMessageResult) => void = () => {};
    const pending = new Promise<SendMessageResult>((r) => {
      resolveSend = r;
    });
    mockHiBit({ sendKidMessage: vi.fn().mockReturnValue(pending) });

    const sendPromise = useChatStore.getState().send("ada", "ready");
    const requestId = useChatStore.getState().activeRequestId;
    expect(requestId).toEqual(expect.any(String));

    useChatStore.getState().appendStreamingDelta("stale", "old");
    useChatStore.getState().appendStreamingDelta(requestId, "new");
    expect(useChatStore.getState().streamingText).toBe("new");

    resolveSend({ ok: true, text: "done", durationMs: 1 });
    await sendPromise;

    useChatStore.getState().appendStreamingDelta(requestId, "late");
    expect(useChatStore.getState().streamingText).toBeNull();
  });

  it("reset clears messages, status, error, and hydrate state", () => {
    useChatStore.setState({
      messages: [{ id: "m1", role: "kid", kind: "text", text: "x", timestamp: "t" }],
      status: "idle",
      error: "err",
      hydrateStatus: "ready",
      hydrateError: "stale",
      hydratedSessionId: "sess-1",
      greetingForSessionId: "sess-1",
      streamingText: "typing",
      activeRequestId: "request-1",
    });
    useChatStore.getState().reset();
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.hydrateStatus).toBe("idle");
    expect(state.hydrateError).toBeNull();
    expect(state.hydratedSessionId).toBeNull();
    expect(state.greetingForSessionId).toBeNull();
    expect(state.streamingText).toBeNull();
    expect(state.activeRequestId).toBeNull();
  });

  it("hydrate populates messages from the persisted kid transcript", async () => {
    const transcript: TranscriptEvent[] = [
      {
        timestamp: "t1",
        role: "kid",
        sessionId: "sess-1",
        kind: "user_message",
        text: "hi bit",
      },
      {
        timestamp: "t2",
        role: "kid",
        sessionId: "sess-1",
        kind: "assistant_message",
        text: "hey Ada",
      },
    ];
    const getTranscript = vi.fn().mockResolvedValue(transcript);
    mockHiBit({ getTranscript });

    await useChatStore.getState().hydrate("ada", "sess-1");

    const state = useChatStore.getState();
    expect(getTranscript).toHaveBeenCalledWith("ada", "sess-1");
    expect(state.hydrateStatus).toBe("ready");
    expect(state.hydratedSessionId).toBe("sess-1");
    expect(state.messages.map((m) => `${m.role}:${m.text}`)).toEqual(["kid:hi bit", "bit:hey Ada"]);
  });

  it("hydrate records the error when the IPC rejects", async () => {
    mockHiBit({ getTranscript: vi.fn().mockRejectedValue(new Error("disk gone")) });
    await useChatStore.getState().hydrate("ada", "sess-1");
    const state = useChatStore.getState();
    expect(state.hydrateStatus).toBe("error");
    expect(state.hydrateError).toBe("disk gone");
    expect(state.messages).toEqual([]);
    expect(state.hydratedSessionId).toBeNull();
  });

  it("hydrate replaces prior messages when switching sessions", async () => {
    useChatStore.setState({
      messages: [{ id: "old", role: "kid", kind: "text", text: "old msg", timestamp: "t0" }],
      hydratedSessionId: "sess-0",
      hydrateStatus: "ready",
    });
    mockHiBit({
      getTranscript: vi.fn().mockResolvedValue([
        {
          timestamp: "t1",
          role: "kid",
          sessionId: "sess-1",
          kind: "user_message",
          text: "new msg",
        },
      ]),
    });
    await useChatStore.getState().hydrate("ada", "sess-1");
    const state = useChatStore.getState();
    expect(state.messages.map((m) => m.text)).toEqual(["new msg"]);
    expect(state.hydratedSessionId).toBe("sess-1");
  });

  it("canRetryLastKidMessage is true only when the last bit bubble is an error after a kid turn", () => {
    expect(canRetryLastKidMessage([])).toBe(false);
    expect(
      canRetryLastKidMessage([{ id: "1", role: "kid", kind: "text", text: "hi", timestamp: "t" }]),
    ).toBe(false);
    expect(
      canRetryLastKidMessage([
        { id: "1", role: "kid", kind: "text", text: "hi", timestamp: "t1" },
        { id: "2", role: "bit", kind: "text", text: "hey", timestamp: "t2" },
      ]),
    ).toBe(false);
    expect(
      canRetryLastKidMessage([
        { id: "1", role: "kid", kind: "text", text: "hi", timestamp: "t1" },
        { id: "2", role: "bit", kind: "error", text: "snack", timestamp: "t2" },
      ]),
    ).toBe(true);
  });

  it("retry resends the last kid prompt and replaces the error bubble with a successful reply", async () => {
    const sendKidMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom", durationMs: 1 })
      .mockResolvedValueOnce({ ok: true, text: "hi Ada!", durationMs: 2 });
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().send("ada", "hello");
    expect(useChatStore.getState().messages.map((m) => m.kind)).toEqual(["text", "error"]);

    await useChatStore.getState().retry("ada");

    expect(sendKidMessage).toHaveBeenNthCalledWith(2, "ada", "hello", expect.any(String));
    const state = useChatStore.getState();
    expect(state.messages.map((m) => `${m.role}:${m.kind}:${m.text}`)).toEqual([
      "kid:text:hello",
      "bit:text:hi Ada!",
    ]);
    expect(state.error).toBeNull();
  });

  it("retry replaces the error bubble with a fresh error bubble on continued failure", async () => {
    const sendKidMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom", durationMs: 1 })
      .mockResolvedValueOnce({ ok: false, error: "boom again", durationMs: 1 });
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().send("ada", "hello");
    await useChatStore.getState().retry("ada");

    const state = useChatStore.getState();
    expect(sendKidMessage).toHaveBeenCalledTimes(2);
    expect(state.messages.length).toBe(2);
    expect(state.messages[1]).toMatchObject({ role: "bit", kind: "error" });
    expect(state.error).toBe("boom again");
  });

  it("retry is a no-op when the last bit bubble is a successful reply", async () => {
    const sendKidMessage = vi.fn().mockResolvedValue({ ok: true, text: "hi", durationMs: 1 });
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().send("ada", "hello");
    await useChatStore.getState().retry("ada");

    expect(sendKidMessage).toHaveBeenCalledTimes(1);
  });

  it("retry is a no-op when no messages exist yet", async () => {
    const sendKidMessage = vi.fn();
    mockHiBit({ sendKidMessage });

    const result = await useChatStore.getState().retry("ada");
    expect(result).toBeNull();
    expect(sendKidMessage).not.toHaveBeenCalled();
  });

  it("retry is a no-op while a send is already in flight", async () => {
    const sendKidMessage = vi.fn().mockResolvedValue({ ok: false, error: "boom", durationMs: 1 });
    mockHiBit({ sendKidMessage });

    await useChatStore.getState().send("ada", "hello");
    useChatStore.setState({ status: "sending" });

    const result = await useChatStore.getState().retry("ada");
    expect(result).toBeNull();
    expect(sendKidMessage).toHaveBeenCalledTimes(1);
  });

  it("seedKidGreeting injects a Bit bubble when the hydrated session is empty", async () => {
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue([]) });
    await useChatStore.getState().hydrate("ada", "sess-1");

    useChatStore.getState().seedKidGreeting("sess-1", "Hey Ada! Ready to build?");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "bit",
      kind: "text",
      text: "Hey Ada! Ready to build?",
    });
    expect(state.greetingForSessionId).toBe("sess-1");
  });

  it("seedKidGreeting is a no-op when the session already has messages", async () => {
    const transcript: TranscriptEvent[] = [
      {
        timestamp: "t1",
        role: "kid",
        sessionId: "sess-1",
        kind: "user_message",
        text: "hi bit",
      },
    ];
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue(transcript) });
    await useChatStore.getState().hydrate("ada", "sess-1");

    useChatStore.getState().seedKidGreeting("sess-1", "Hey Ada!");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toBe("hi bit");
    expect(state.greetingForSessionId).toBeNull();
  });

  it("seedKidGreeting is a no-op when the sessionId does not match the hydrated session", async () => {
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue([]) });
    await useChatStore.getState().hydrate("ada", "sess-1");

    useChatStore.getState().seedKidGreeting("sess-other", "Hey Ada!");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(0);
    expect(state.greetingForSessionId).toBeNull();
  });

  it("seedKidGreeting only seeds once per session even when called twice", async () => {
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue([]) });
    await useChatStore.getState().hydrate("ada", "sess-1");

    useChatStore.getState().seedKidGreeting("sess-1", "first");
    useChatStore.getState().seedKidGreeting("sess-1", "second");

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toBe("first");
  });

  it("hydrate clears the seeded-greeting marker so a re-hydrate can re-seed", async () => {
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue([]) });
    await useChatStore.getState().hydrate("ada", "sess-1");
    useChatStore.getState().seedKidGreeting("sess-1", "first");
    expect(useChatStore.getState().greetingForSessionId).toBe("sess-1");

    await useChatStore.getState().hydrate("ada", "sess-1");
    expect(useChatStore.getState().greetingForSessionId).toBeNull();
    useChatStore.getState().seedKidGreeting("sess-1", "second");
    expect(useChatStore.getState().messages[0].text).toBe("second");
  });

  it("ignores a second send while one is already in flight", async () => {
    let resolveSend: (v: SendMessageResult) => void = () => {};
    const pending = new Promise<SendMessageResult>((r) => {
      resolveSend = r;
    });
    const sendKidMessage = vi.fn().mockReturnValue(pending);
    mockHiBit({ sendKidMessage });

    const p1 = useChatStore.getState().send("ada", "first");
    const p2 = useChatStore.getState().send("ada", "second");
    expect(useChatStore.getState().messages.map((m) => m.text)).toEqual(["first"]);
    expect(sendKidMessage).toHaveBeenCalledTimes(1);

    resolveSend({ ok: true, text: "response", durationMs: 10 });
    await Promise.all([p1, p2]);

    const state = useChatStore.getState();
    expect(state.messages.length).toBe(2);
    expect(state.messages[1].text).toBe("response");
  });
});
