import type { Profile, ProfileInput } from "@shared/profile";
import { emptyProgress, type Progress } from "@shared/progress";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "./chatStore";
import { useProfileStore } from "./profileStore";
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

function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "ada",
    name: "Ada",
    age: 9,
    interests: [],
    dreamHistory: [],
    sessions: { kid: "k-1", parent: "p-1" },
    createdAt: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  useProfileStore.setState({
    profiles: [],
    status: "idle",
    error: null,
    activeProfileId: null,
  });
  useProgressStore.setState({
    progress: null,
    profileId: null,
    status: "idle",
    error: null,
    updateError: null,
  });
  useChatStore.getState().reset();
});

describe("useProfileStore", () => {
  it("loads profiles and transitions through loading -> ready", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    const bea = fakeProfile({ id: "bea", name: "Bea", createdAt: "2026-04-23T00:00:00.000Z" });
    mockHiBit({ listProfiles: vi.fn().mockResolvedValue([ada, bea]) });

    const promise = useProfileStore.getState().loadProfiles();
    expect(useProfileStore.getState().status).toBe("loading");
    await promise;

    const state = useProfileStore.getState();
    expect(state.status).toBe("ready");
    expect(state.profiles).toEqual([ada, bea]);
    expect(state.error).toBeNull();
  });

  it("records the error when listProfiles rejects", async () => {
    mockHiBit({ listProfiles: vi.fn().mockRejectedValue(new Error("boom")) });

    await useProfileStore.getState().loadProfiles();

    const state = useProfileStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("boom");
    expect(state.profiles).toEqual([]);
  });

  it("appends created profiles and keeps them sorted by createdAt", async () => {
    const first = fakeProfile({ id: "ada", createdAt: "2026-04-22T00:00:00.000Z" });
    useProfileStore.setState({ profiles: [first], status: "ready" });

    const newer = fakeProfile({ id: "bea", name: "Bea", createdAt: "2026-04-23T00:00:00.000Z" });
    const createProfile = vi.fn().mockResolvedValue(newer);
    mockHiBit({ createProfile });

    const input: ProfileInput = { name: "Bea", age: 10 };
    const result = await useProfileStore.getState().createProfile(input);

    expect(createProfile).toHaveBeenCalledWith(input);
    expect(result).toEqual(newer);
    expect(useProfileStore.getState().profiles.map((p) => p.id)).toEqual(["ada", "bea"]);
  });

  it("tracks the active profile id", () => {
    useProfileStore.getState().selectProfile("ada");
    expect(useProfileStore.getState().activeProfileId).toBe("ada");
    useProfileStore.getState().selectProfile(null);
    expect(useProfileStore.getState().activeProfileId).toBeNull();
  });

  it("setCurrentDream merges the updated profile back into the list", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    const bea = fakeProfile({ id: "bea", name: "Bea" });
    useProfileStore.setState({ profiles: [ada, bea], status: "ready" });

    const updatedAda: Profile = {
      ...ada,
      currentDreamId: "hello-card",
      dreamHistory: ["hello-card"],
    };
    const setCurrentDream = vi.fn().mockResolvedValue(updatedAda);
    mockHiBit({
      setCurrentDream,
      getProgress: vi.fn().mockResolvedValue(emptyProgress()),
      getTranscript: vi.fn().mockResolvedValue([]),
    });

    const result = await useProfileStore.getState().setCurrentDream("ada", "hello-card");
    expect(setCurrentDream).toHaveBeenCalledWith("ada", "hello-card");
    expect(result).toEqual(updatedAda);

    const state = useProfileStore.getState();
    expect(state.profiles.find((p) => p.id === "ada")?.currentDreamId).toBe("hello-card");
    expect(state.profiles.find((p) => p.id === "bea")).toEqual(bea);
  });

  it("setCurrentDream re-hydrates the kid chat against the rotated session id so the kid starts clean", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada", sessions: { kid: "k-1", parent: "p-1" } });
    useProfileStore.setState({ profiles: [ada], status: "ready" });

    // Main rotates sessions.kid when the dream actually changes; renderer must follow.
    const updatedAda: Profile = {
      ...ada,
      currentDreamId: "dice-roller",
      dreamHistory: ["hello-card", "dice-roller"],
      sessions: { kid: "k-2", parent: "p-1" },
    };
    const getTranscript = vi.fn().mockResolvedValue([]);
    mockHiBit({
      setCurrentDream: vi.fn().mockResolvedValue(updatedAda),
      getProgress: vi.fn().mockResolvedValue(emptyProgress()),
      getTranscript,
    });

    await useProfileStore.getState().setCurrentDream("ada", "dice-roller");

    expect(getTranscript).toHaveBeenCalledWith("ada", "k-2");
    const chatState = useChatStore.getState();
    expect(chatState.hydratedSessionId).toBe("k-2");
    expect(chatState.messages).toEqual([]);
  });

  it("setCurrentDream resyncs the progress store so a freshly created project entry is visible", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    useProfileStore.setState({ profiles: [ada], status: "ready" });

    // Stale progress already loaded for ada with no projects yet.
    const stale: Progress = emptyProgress();
    useProgressStore.setState({ progress: stale, profileId: "ada", status: "ready" });

    const updatedAda: Profile = {
      ...ada,
      currentDreamId: "hello-card",
      dreamHistory: ["hello-card"],
    };
    const fresh: Progress = {
      ...emptyProgress(),
      projects: [
        {
          dreamId: "hello-card",
          slug: "hello-card",
          startedAt: "2026-04-24T00:00:00.000Z",
          lastActiveAt: "2026-04-24T00:00:00.000Z",
        },
      ],
    };
    const getProgress = vi.fn().mockResolvedValue(fresh);
    mockHiBit({
      setCurrentDream: vi.fn().mockResolvedValue(updatedAda),
      getProgress,
      getTranscript: vi.fn().mockResolvedValue([]),
    });

    await useProfileStore.getState().setCurrentDream("ada", "hello-card");

    expect(getProgress).toHaveBeenCalledWith("ada");
    const progressState = useProgressStore.getState();
    expect(progressState.profileId).toBe("ada");
    expect(progressState.progress?.projects.map((p) => p.dreamId)).toEqual(["hello-card"]);
  });

  it("deleteProfile removes the profile from the list", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    const bea = fakeProfile({ id: "bea", name: "Bea" });
    useProfileStore.setState({ profiles: [ada, bea], status: "ready" });

    const deleteProfile = vi.fn().mockResolvedValue(undefined);
    mockHiBit({ deleteProfile });

    await useProfileStore.getState().deleteProfile("ada");

    expect(deleteProfile).toHaveBeenCalledWith("ada");
    const state = useProfileStore.getState();
    expect(state.profiles.map((p) => p.id)).toEqual(["bea"]);
  });

  it("deleteProfile clears activeProfileId when it matches the deleted profile", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    useProfileStore.setState({ profiles: [ada], status: "ready", activeProfileId: "ada" });

    mockHiBit({ deleteProfile: vi.fn().mockResolvedValue(undefined) });
    await useProfileStore.getState().deleteProfile("ada");

    expect(useProfileStore.getState().activeProfileId).toBeNull();
  });

  it("deleteProfile preserves activeProfileId when a different profile is deleted", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    const bea = fakeProfile({ id: "bea", name: "Bea" });
    useProfileStore.setState({ profiles: [ada, bea], status: "ready", activeProfileId: "ada" });

    mockHiBit({ deleteProfile: vi.fn().mockResolvedValue(undefined) });
    await useProfileStore.getState().deleteProfile("bea");

    expect(useProfileStore.getState().activeProfileId).toBe("ada");
  });

  it("exportProfile returns the export path from the hibit API", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    useProfileStore.setState({ profiles: [ada], status: "ready", activeProfileId: "ada" });

    const exportProfile = vi.fn().mockResolvedValue("/tmp/exports/ada-2026-04-23");
    mockHiBit({ exportProfile });

    const result = await useProfileStore.getState().exportProfile("ada");

    expect(exportProfile).toHaveBeenCalledWith("ada");
    expect(result).toBe("/tmp/exports/ada-2026-04-23");
    expect(useProfileStore.getState().profiles).toEqual([ada]);
    expect(useProfileStore.getState().activeProfileId).toBe("ada");
  });

  it("exportProfile returns null when the user cancels the dialog", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    useProfileStore.setState({ profiles: [ada], status: "ready", activeProfileId: "ada" });

    const exportProfile = vi.fn().mockResolvedValue(null);
    mockHiBit({ exportProfile });

    const result = await useProfileStore.getState().exportProfile("ada");

    expect(exportProfile).toHaveBeenCalledWith("ada");
    expect(result).toBeNull();
  });

  it("exportProfile surfaces the underlying error when the hibit API rejects", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    useProfileStore.setState({ profiles: [ada], status: "ready" });

    const exportProfile = vi.fn().mockRejectedValue(new Error("disk full"));
    mockHiBit({ exportProfile });

    await expect(useProfileStore.getState().exportProfile("ada")).rejects.toThrow("disk full");
  });

  it("updateSettings merges the updated profile back into the list", async () => {
    const ada = fakeProfile({ id: "ada", name: "Ada" });
    const bea = fakeProfile({ id: "bea", name: "Bea" });
    useProfileStore.setState({ profiles: [ada, bea], status: "ready" });

    const updatedAda: Profile = {
      ...ada,
      sessionTargetMinutes: 25,
      voicePreferences: "gentle",
    };
    const updateProfileSettings = vi.fn().mockResolvedValue(updatedAda);
    mockHiBit({ updateProfileSettings });

    const result = await useProfileStore
      .getState()
      .updateSettings("ada", { sessionTargetMinutes: 25, voicePreferences: "gentle" });
    expect(updateProfileSettings).toHaveBeenCalledWith("ada", {
      sessionTargetMinutes: 25,
      voicePreferences: "gentle",
    });
    expect(result).toEqual(updatedAda);

    const state = useProfileStore.getState();
    expect(state.profiles.find((p) => p.id === "ada")?.sessionTargetMinutes).toBe(25);
    expect(state.profiles.find((p) => p.id === "ada")?.voicePreferences).toBe("gentle");
    expect(state.profiles.find((p) => p.id === "bea")).toEqual(bea);
  });
});
