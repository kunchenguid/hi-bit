import { emptyProgress, type KnowledgePointStatus, type Progress } from "@shared/progress";
import { create } from "zustand";

export type ProgressStoreStatus = "idle" | "loading" | "ready" | "error";

export type ProgressStore = {
  progress: Progress | null;
  profileId: string | null;
  status: ProgressStoreStatus;
  error: string | null;
  updateError: string | null;
  load: (profileId: string) => Promise<void>;
  updateStatus: (
    kpId: string,
    status: KnowledgePointStatus | null,
    evidence?: string,
  ) => Promise<void>;
  setSkipped: (kpId: string, skipped: boolean) => Promise<void>;
  reset: () => void;
};

export const useProgressStore = create<ProgressStore>((set, get) => ({
  progress: null,
  profileId: null,
  status: "idle",
  error: null,
  updateError: null,

  load: async (profileId: string) => {
    if (get().status === "loading" && get().profileId === profileId) return;
    set({ status: "loading", error: null, profileId });
    try {
      const progress = await window.hibit.getProgress(profileId);
      set({ progress, status: "ready" });
    } catch (err) {
      set({
        status: "error",
        progress: emptyProgress(),
        error: err instanceof Error ? err.message : "Failed to load progress",
      });
    }
  },

  updateStatus: async (
    kpId: string,
    status: KnowledgePointStatus | null,
    evidence?: string,
  ): Promise<void> => {
    const { profileId } = get();
    if (!profileId) {
      set({ updateError: "No profile loaded" });
      return;
    }
    set({ updateError: null });
    try {
      const progress = await window.hibit.updateKpStatus(profileId, kpId, status, evidence);
      set({ progress });
    } catch (err) {
      set({ updateError: err instanceof Error ? err.message : "Failed to update mastery" });
    }
  },

  setSkipped: async (kpId: string, skipped: boolean): Promise<void> => {
    const { profileId } = get();
    if (!profileId) {
      set({ updateError: "No profile loaded" });
      return;
    }
    set({ updateError: null });
    try {
      const progress = await window.hibit.updateKpSkipped(profileId, kpId, skipped);
      set({ progress });
    } catch (err) {
      set({ updateError: err instanceof Error ? err.message : "Failed to update skipped" });
    }
  },

  reset: () => {
    set({ progress: null, profileId: null, status: "idle", error: null, updateError: null });
  },
}));
