import type { Profile, ProfileInput, ProfileSettingsInput } from "@shared/profile";
import { create } from "zustand";
import { useChatStore } from "./chatStore";
import { useProgressStore } from "./progressStore";

export type ProfileStoreStatus = "idle" | "loading" | "ready" | "error";

export type ProfileStore = {
  profiles: Profile[];
  status: ProfileStoreStatus;
  error: string | null;
  activeProfileId: string | null;
  loadProfiles: () => Promise<void>;
  createProfile: (input: ProfileInput, parentPin: string) => Promise<Profile>;
  deleteProfile: (profileId: string) => Promise<void>;
  exportProfile: (profileId: string) => Promise<string | null>;
  selectProfile: (profileId: string | null) => void;
  setCurrentDream: (profileId: string, dreamId: string) => Promise<Profile>;
  updateSettings: (profileId: string, settings: ProfileSettingsInput) => Promise<Profile>;
};

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profiles: [],
  status: "idle",
  error: null,
  activeProfileId: null,

  loadProfiles: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const profiles = await window.hibit.listProfiles();
      set({ profiles, status: "ready" });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load profiles",
      });
    }
  },

  createProfile: async (input, parentPin) => {
    const profile = await window.hibit.createProfile(input, parentPin);
    set((state) => ({
      profiles: [...state.profiles, profile].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));
    return profile;
  },

  deleteProfile: async (profileId) => {
    await window.hibit.deleteProfile(profileId);
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== profileId),
      activeProfileId: state.activeProfileId === profileId ? null : state.activeProfileId,
    }));
  },

  exportProfile: async (profileId) => {
    return window.hibit.exportProfile(profileId);
  },

  selectProfile: (profileId) => {
    set({ activeProfileId: profileId });
  },

  setCurrentDream: async (profileId, dreamId) => {
    const updated = await window.hibit.setCurrentDream(profileId, dreamId);
    set((state) => ({
      profiles: state.profiles.map((p) => (p.id === updated.id ? updated : p)),
    }));
    // The main process upserts a project entry into progress.json as part of
    // set-current-dream, so the renderer's progress cache must be refreshed
    // before the kid navigates to "My projects".
    await useProgressStore.getState().load(profileId);
    // Main also appends a system_event divider when the dream changes mid-session.
    // Re-hydrate the chat so the new event lands in the renderer's message list.
    await useChatStore.getState().hydrate(profileId, updated.sessions.kid);
    return updated;
  },

  updateSettings: async (profileId, settings) => {
    const updated = await window.hibit.updateProfileSettings(profileId, settings);
    set((state) => ({
      profiles: state.profiles.map((p) => (p.id === updated.id ? updated : p)),
    }));
    return updated;
  },
}));
