import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuditStore } from "./auditStore";

type HiBitApi = typeof window.hibit;

function mockHiBit(partial: Partial<HiBitApi>): void {
  (globalThis as unknown as { window: { hibit: HiBitApi } }).window = {
    hibit: {
      getAppInfo: vi.fn(),
      listProfiles: vi.fn(),
      createProfile: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      getKnowledgeGraph: vi.fn(),
      getDreams: vi.fn(),
      setCurrentDream: vi.fn(),
      sendKidMessage: vi.fn(),
      listProjectFiles: vi.fn(),
      readProjectFile: vi.fn(),
      writeProjectFile: vi.fn(),
      getProgress: vi.fn(),
      getSessionLog: vi.fn(),
      getTranscript: vi.fn(),
      hasParentPin: vi.fn(),
      setParentPin: vi.fn(),
      verifyParentPin: vi.fn(),
      clearParentPin: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

function makeSession(
  overrides: Partial<HarnessInvocationLogEntry> = {},
): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-23T10:00:00.000Z",
    harness: "claude",
    role: "kid",
    sessionId: "sess-1",
    mode: "start",
    durationMs: 1234,
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TranscriptEvent> = {}): TranscriptEvent {
  return {
    timestamp: "2026-04-23T10:00:01.000Z",
    role: "kid",
    sessionId: "sess-1",
    kind: "user_message",
    text: "hi",
    ...overrides,
  };
}

beforeEach(() => {
  useAuditStore.setState({
    profileId: null,
    sessions: [],
    status: "idle",
    error: null,
    activeSessionId: null,
    transcript: [],
    transcriptStatus: "idle",
    transcriptError: null,
  });
});

describe("useAuditStore", () => {
  it("loads sessions for the given profile", async () => {
    const sessions = [makeSession({ sessionId: "a" }), makeSession({ sessionId: "b" })];
    mockHiBit({ getSessionLog: vi.fn().mockResolvedValue(sessions) });

    await useAuditStore.getState().loadSessions("ada");

    const state = useAuditStore.getState();
    expect(state.status).toBe("ready");
    expect(state.profileId).toBe("ada");
    expect(state.sessions).toEqual(sessions);
    expect(state.error).toBeNull();
  });

  it("captures a session-log IPC error", async () => {
    mockHiBit({ getSessionLog: vi.fn().mockRejectedValue(new Error("disk gone")) });

    await useAuditStore.getState().loadSessions("ada");

    const state = useAuditStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("disk gone");
    expect(state.sessions).toEqual([]);
  });

  it("loads a transcript and tracks the active sessionId", async () => {
    const events = [
      makeEvent({ kind: "user_message", text: "hi" }),
      makeEvent({ kind: "assistant_message", text: "hello friend" }),
    ];
    mockHiBit({ getTranscript: vi.fn().mockResolvedValue(events) });

    await useAuditStore.getState().loadTranscript("ada", "sess-1");

    const state = useAuditStore.getState();
    expect(state.transcriptStatus).toBe("ready");
    expect(state.activeSessionId).toBe("sess-1");
    expect(state.transcript).toEqual(events);
    expect(state.transcriptError).toBeNull();
  });

  it("captures a transcript IPC error without losing the active sessionId", async () => {
    mockHiBit({ getTranscript: vi.fn().mockRejectedValue(new Error("nope")) });

    await useAuditStore.getState().loadTranscript("ada", "sess-1");

    const state = useAuditStore.getState();
    expect(state.transcriptStatus).toBe("error");
    expect(state.activeSessionId).toBe("sess-1");
    expect(state.transcript).toEqual([]);
    expect(state.transcriptError).toBe("nope");
  });

  it("clearTranscript resets transcript fields without touching sessions", async () => {
    mockHiBit({
      getSessionLog: vi.fn().mockResolvedValue([makeSession()]),
      getTranscript: vi.fn().mockResolvedValue([makeEvent()]),
    });
    await useAuditStore.getState().loadSessions("ada");
    await useAuditStore.getState().loadTranscript("ada", "sess-1");
    useAuditStore.getState().clearTranscript();

    const state = useAuditStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.profileId).toBe("ada");
    expect(state.activeSessionId).toBeNull();
    expect(state.transcript).toEqual([]);
    expect(state.transcriptStatus).toBe("idle");
    expect(state.transcriptError).toBeNull();
  });

  it("reset returns every field to idle", async () => {
    mockHiBit({
      getSessionLog: vi.fn().mockResolvedValue([makeSession()]),
      getTranscript: vi.fn().mockResolvedValue([makeEvent()]),
    });
    await useAuditStore.getState().loadSessions("ada");
    await useAuditStore.getState().loadTranscript("ada", "sess-1");
    useAuditStore.getState().reset();

    const state = useAuditStore.getState();
    expect(state.profileId).toBeNull();
    expect(state.sessions).toEqual([]);
    expect(state.status).toBe("idle");
    expect(state.activeSessionId).toBeNull();
    expect(state.transcript).toEqual([]);
    expect(state.transcriptStatus).toBe("idle");
  });
});
