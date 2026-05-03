import { emptyProgress, type Progress } from "@shared/progress";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressStore } from "./progressStore";

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
      updateKpStatus: vi.fn(),
      hasParentPin: vi.fn(),
      setParentPin: vi.fn(),
      verifyParentPin: vi.fn(),
      clearParentPin: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

beforeEach(() => {
  useProgressStore.setState({
    progress: null,
    profileId: null,
    status: "idle",
    error: null,
    updateError: null,
  });
});

describe("useProgressStore", () => {
  it("loads progress for the given profile", async () => {
    const progress: Progress = {
      ...emptyProgress(),
      knowledgePoints: {
        "html-doc-shell": {
          status: "did_with_help",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:10:00.000Z",
        },
      },
    };
    mockHiBit({ getProgress: vi.fn().mockResolvedValue(progress) });

    await useProgressStore.getState().load("ada");

    const state = useProgressStore.getState();
    expect(state.status).toBe("ready");
    expect(state.profileId).toBe("ada");
    expect(state.progress).toEqual(progress);
    expect(state.error).toBeNull();
  });

  it("captures an IPC error without leaving a stale profile", async () => {
    mockHiBit({ getProgress: vi.fn().mockRejectedValue(new Error("disk gone")) });

    await useProgressStore.getState().load("ada");

    const state = useProgressStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("disk gone");
    expect(state.progress).toEqual(emptyProgress());
  });

  it("updateStatus calls IPC with the current profileId and merges the returned progress", async () => {
    const initial: Progress = emptyProgress();
    const updated: Progress = {
      ...initial,
      knowledgePoints: {
        "html-doc-shell": {
          status: "did_with_help",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:10:00.000Z",
        },
      },
    };
    const updateKpStatus = vi.fn().mockResolvedValue(updated);
    mockHiBit({ getProgress: vi.fn().mockResolvedValue(initial), updateKpStatus });

    await useProgressStore.getState().load("ada");
    await useProgressStore.getState().updateStatus("html-doc-shell", "did_with_help", "saw it");

    expect(updateKpStatus).toHaveBeenCalledWith("ada", "html-doc-shell", "did_with_help", "saw it");
    const state = useProgressStore.getState();
    expect(state.progress).toEqual(updated);
    expect(state.updateError).toBeNull();
  });

  it("updateStatus captures an IPC error without mutating progress", async () => {
    const initial: Progress = emptyProgress();
    mockHiBit({
      getProgress: vi.fn().mockResolvedValue(initial),
      updateKpStatus: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    await useProgressStore.getState().load("ada");
    await useProgressStore.getState().updateStatus("html-doc-shell", "saw_it");

    const state = useProgressStore.getState();
    expect(state.updateError).toBe("disk full");
    expect(state.progress).toEqual(initial);
  });

  it("updateStatus short-circuits when no profile is loaded", async () => {
    const updateKpStatus = vi.fn();
    mockHiBit({ updateKpStatus });

    await useProgressStore.getState().updateStatus("html-doc-shell", "saw_it");

    expect(updateKpStatus).not.toHaveBeenCalled();
    expect(useProgressStore.getState().updateError).toBe("No profile loaded");
  });

  it("reset clears all fields back to idle", async () => {
    mockHiBit({ getProgress: vi.fn().mockResolvedValue(emptyProgress()) });
    await useProgressStore.getState().load("ada");
    useProgressStore.getState().reset();

    const state = useProgressStore.getState();
    expect(state.status).toBe("idle");
    expect(state.progress).toBeNull();
    expect(state.profileId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("setSkipped calls IPC with the current profileId and merges the returned progress", async () => {
    const initial: Progress = emptyProgress();
    const updated: Progress = {
      ...initial,
      knowledgePoints: {
        "css-colors": {
          status: "saw_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          skipped: true,
        },
      },
    };
    const updateKpSkipped = vi.fn().mockResolvedValue(updated);
    mockHiBit({ getProgress: vi.fn().mockResolvedValue(initial), updateKpSkipped });

    await useProgressStore.getState().load("ada");
    await useProgressStore.getState().setSkipped("css-colors", true);

    expect(updateKpSkipped).toHaveBeenCalledWith("ada", "css-colors", true);
    const state = useProgressStore.getState();
    expect(state.progress).toEqual(updated);
    expect(state.updateError).toBeNull();
  });

  it("setSkipped captures an IPC error without mutating progress", async () => {
    const initial: Progress = emptyProgress();
    mockHiBit({
      getProgress: vi.fn().mockResolvedValue(initial),
      updateKpSkipped: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    await useProgressStore.getState().load("ada");
    await useProgressStore.getState().setSkipped("css-colors", true);

    const state = useProgressStore.getState();
    expect(state.updateError).toBe("disk full");
    expect(state.progress).toEqual(initial);
  });

  it("setSkipped short-circuits when no profile is loaded", async () => {
    const updateKpSkipped = vi.fn();
    mockHiBit({ updateKpSkipped });

    await useProgressStore.getState().setSkipped("css-colors", true);

    expect(updateKpSkipped).not.toHaveBeenCalled();
    expect(useProgressStore.getState().updateError).toBe("No profile loaded");
  });
});
