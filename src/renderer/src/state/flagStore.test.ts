import type { ParentFlag } from "@shared/flag";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFlagStore } from "./flagStore";

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
      sendParentMessage: vi.fn(),
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
      listFlags: vi.fn(),
      writeFlag: vi.fn(),
      deleteFlag: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

function makeFlag(overrides: Partial<ParentFlag> = {}): ParentFlag {
  return {
    flaggedAt: "2026-04-23T10:15:00.000Z",
    sessionId: "sess-1",
    messageTimestamp: "2026-04-23T09:45:00.000Z",
    messageRole: "kid",
    messageKind: "assistant_message",
    messageText: "lol just write it for you",
    reason: "do not write it without teaching",
    ...overrides,
  };
}

beforeEach(() => {
  useFlagStore.setState({
    profileId: null,
    flags: [],
    status: "idle",
    error: null,
    writeStatus: "idle",
    writeError: null,
  });
});

describe("useFlagStore", () => {
  it("loads flags for the given profile", async () => {
    const flags = [makeFlag({ messageText: "a" }), makeFlag({ messageText: "b" })];
    mockHiBit({ listFlags: vi.fn().mockResolvedValue(flags) });

    await useFlagStore.getState().load("ada");

    const state = useFlagStore.getState();
    expect(state.status).toBe("ready");
    expect(state.profileId).toBe("ada");
    expect(state.flags).toEqual(flags);
    expect(state.error).toBeNull();
  });

  it("captures a load IPC error", async () => {
    mockHiBit({ listFlags: vi.fn().mockRejectedValue(new Error("disk gone")) });

    await useFlagStore.getState().load("ada");

    const state = useFlagStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("disk gone");
    expect(state.flags).toEqual([]);
  });

  it("save writes a flag and refreshes the list", async () => {
    const flag = makeFlag();
    const listFlags = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([flag]);
    const writeFlag = vi.fn().mockResolvedValue("name.md");
    mockHiBit({ listFlags, writeFlag });

    await useFlagStore.getState().load("ada");
    const ok = await useFlagStore.getState().save("ada", flag);

    const state = useFlagStore.getState();
    expect(ok).toBe(true);
    expect(writeFlag).toHaveBeenCalledWith("ada", flag);
    expect(state.flags).toEqual([flag]);
    expect(state.writeStatus).toBe("idle");
    expect(state.writeError).toBeNull();
  });

  it("save surfaces a write IPC error", async () => {
    mockHiBit({
      listFlags: vi.fn().mockResolvedValue([]),
      writeFlag: vi.fn().mockRejectedValue(new Error("bad reason")),
    });

    const ok = await useFlagStore.getState().save("ada", makeFlag());

    const state = useFlagStore.getState();
    expect(ok).toBe(false);
    expect(state.writeStatus).toBe("error");
    expect(state.writeError).toBe("bad reason");
  });

  it("remove deletes a flag and refreshes the list", async () => {
    const flag = makeFlag();
    const listFlags = vi.fn().mockResolvedValueOnce([flag]).mockResolvedValueOnce([]);
    const deleteFlag = vi.fn().mockResolvedValue(undefined);
    mockHiBit({ listFlags, deleteFlag });

    await useFlagStore.getState().load("ada");
    const ok = await useFlagStore.getState().remove("ada", flag);

    const state = useFlagStore.getState();
    expect(ok).toBe(true);
    expect(deleteFlag).toHaveBeenCalledWith("ada", flag);
    expect(state.flags).toEqual([]);
    expect(state.writeStatus).toBe("idle");
    expect(state.writeError).toBeNull();
  });

  it("remove surfaces a delete IPC error", async () => {
    mockHiBit({
      listFlags: vi.fn().mockResolvedValue([]),
      deleteFlag: vi.fn().mockRejectedValue(new Error("locked")),
    });

    const ok = await useFlagStore.getState().remove("ada", makeFlag());

    const state = useFlagStore.getState();
    expect(ok).toBe(false);
    expect(state.writeStatus).toBe("error");
    expect(state.writeError).toBe("locked");
  });

  it("reset returns every field to idle", async () => {
    mockHiBit({ listFlags: vi.fn().mockResolvedValue([makeFlag()]) });
    await useFlagStore.getState().load("ada");
    useFlagStore.getState().reset();

    const state = useFlagStore.getState();
    expect(state.profileId).toBeNull();
    expect(state.flags).toEqual([]);
    expect(state.status).toBe("idle");
    expect(state.writeStatus).toBe("idle");
  });
});
