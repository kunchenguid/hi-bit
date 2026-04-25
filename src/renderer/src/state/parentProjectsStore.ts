import type { ProjectFile } from "@shared/project";
import { create } from "zustand";

export type ParentProjectsStatus = "idle" | "loading" | "ready" | "error";
export type ParentProjectFileStatus = "idle" | "loading" | "ready" | "error";

export type ParentProjectsStore = {
  profileId: string | null;
  slugs: string[];
  status: ParentProjectsStatus;
  error: string | null;
  activeSlug: string | null;
  files: ProjectFile[];
  activeFileName: string | null;
  fileStatus: ParentProjectFileStatus;
  fileError: string | null;
  loadSlugs: (profileId: string) => Promise<void>;
  openProject: (slug: string) => Promise<void>;
  setActiveFile: (name: string) => void;
  closeProject: () => void;
  reset: () => void;
};

export const useParentProjectsStore = create<ParentProjectsStore>((set, get) => ({
  profileId: null,
  slugs: [],
  status: "idle",
  error: null,
  activeSlug: null,
  files: [],
  activeFileName: null,
  fileStatus: "idle",
  fileError: null,

  loadSlugs: async (profileId: string) => {
    if (get().status === "loading" && get().profileId === profileId) return;
    set({ status: "loading", error: null, profileId });
    try {
      const slugs = await window.hibit.listProjectSlugs(profileId);
      set({ slugs, status: "ready" });
    } catch (err) {
      set({
        status: "error",
        slugs: [],
        error: err instanceof Error ? err.message : "Failed to load projects",
      });
    }
  },

  openProject: async (slug: string) => {
    const { profileId } = get();
    if (!profileId) {
      set({ fileStatus: "error", fileError: "No profile loaded" });
      return;
    }
    set({
      activeSlug: slug,
      fileStatus: "loading",
      fileError: null,
      files: [],
      activeFileName: null,
    });
    try {
      const names = await window.hibit.listProjectFiles(profileId, slug);
      const files = await Promise.all(
        names.map((name) => window.hibit.readProjectFile(profileId, slug, name)),
      );
      set({
        files,
        activeFileName: files[0]?.name ?? null,
        fileStatus: "ready",
      });
    } catch (err) {
      set({
        fileStatus: "error",
        files: [],
        activeFileName: null,
        fileError: err instanceof Error ? err.message : "Failed to load project",
      });
    }
  },

  setActiveFile: (name: string) => {
    if (get().files.some((f) => f.name === name)) {
      set({ activeFileName: name });
    }
  },

  closeProject: () => {
    set({
      activeSlug: null,
      files: [],
      activeFileName: null,
      fileStatus: "idle",
      fileError: null,
    });
  },

  reset: () => {
    set({
      profileId: null,
      slugs: [],
      status: "idle",
      error: null,
      activeSlug: null,
      files: [],
      activeFileName: null,
      fileStatus: "idle",
      fileError: null,
    });
  },
}));
