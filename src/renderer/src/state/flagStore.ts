import type { ParentFlag } from "@shared/flag";
import { create } from "zustand";

export type FlagStoreStatus = "idle" | "loading" | "ready" | "error";
export type FlagWriteStatus = "idle" | "saving" | "error";

export type FlagStore = {
  profileId: string | null;
  flags: ParentFlag[];
  status: FlagStoreStatus;
  error: string | null;
  writeStatus: FlagWriteStatus;
  writeError: string | null;
  load: (profileId: string) => Promise<void>;
  save: (profileId: string, flag: ParentFlag) => Promise<boolean>;
  remove: (profileId: string, flag: ParentFlag) => Promise<boolean>;
  reset: () => void;
};

export const useFlagStore = create<FlagStore>((set, get) => ({
  profileId: null,
  flags: [],
  status: "idle",
  error: null,
  writeStatus: "idle",
  writeError: null,

  load: async (profileId: string) => {
    if (get().status === "loading" && get().profileId === profileId) return;
    set({ status: "loading", error: null, profileId });
    try {
      const flags = await window.hibit.listFlags(profileId);
      set({ flags, status: "ready" });
    } catch (err) {
      set({
        status: "error",
        flags: [],
        error: err instanceof Error ? err.message : "Failed to load flags",
      });
    }
  },

  save: async (profileId: string, flag: ParentFlag) => {
    set({ writeStatus: "saving", writeError: null });
    try {
      await window.hibit.writeFlag(profileId, flag);
      const flags = await window.hibit.listFlags(profileId);
      set({ flags, writeStatus: "idle", profileId });
      return true;
    } catch (err) {
      set({
        writeStatus: "error",
        writeError: err instanceof Error ? err.message : "Failed to save flag",
      });
      return false;
    }
  },

  remove: async (profileId: string, flag: ParentFlag) => {
    set({ writeStatus: "saving", writeError: null });
    try {
      await window.hibit.deleteFlag(profileId, flag);
      const flags = await window.hibit.listFlags(profileId);
      set({ flags, writeStatus: "idle", profileId });
      return true;
    } catch (err) {
      set({
        writeStatus: "error",
        writeError: err instanceof Error ? err.message : "Failed to delete flag",
      });
      return false;
    }
  },

  reset: () => {
    set({
      profileId: null,
      flags: [],
      status: "idle",
      error: null,
      writeStatus: "idle",
      writeError: null,
    });
  },
}));
