import type { OpenProjectFolderResult } from "@shared/ipc";
import type { ProjectFile, ProjectFileChange } from "@shared/project";
import { create } from "zustand";

export type ProjectsStatus = "idle" | "loading" | "ready" | "error";

export type ProjectBuffer = {
  name: string;
  savedContent: string;
  content: string;
};

type SubscriptionHandle = {
  id: number;
  close: () => Promise<void>;
};

export type ProjectsStore = {
  profileId: string | null;
  slug: string | null;
  buffers: ProjectBuffer[];
  activeFileName: string | null;
  status: ProjectsStatus;
  error: string | null;
  subscriptionId: number | null;
  load: (profileId: string, slug: string) => Promise<void>;
  setActiveFile: (name: string) => void;
  updateBuffer: (name: string, content: string) => void;
  save: (name: string) => Promise<void>;
  createFile: (name: string, content: string) => Promise<void>;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  openFolder: () => Promise<OpenProjectFolderResult>;
  reset: () => void;
};

function isDirty(buffer: ProjectBuffer): boolean {
  return buffer.content !== buffer.savedContent;
}

export function bufferDirty(store: ProjectsStore, name: string): boolean {
  const buffer = store.buffers.find((b) => b.name === name);
  return buffer ? isDirty(buffer) : false;
}

let activeSubscription: SubscriptionHandle | null = null;

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  profileId: null,
  slug: null,
  buffers: [],
  activeFileName: null,
  status: "idle",
  error: null,
  subscriptionId: null,

  load: async (profileId, slug) => {
    const current = get();
    if (current.status === "loading") return;
    if (current.status === "ready" && current.profileId === profileId && current.slug === slug) {
      return;
    }
    set({ status: "loading", error: null, profileId, slug });
    try {
      const names = await window.hibit.listProjectFiles(profileId, slug);
      const files = await Promise.all(
        names.map((name) => window.hibit.readProjectFile(profileId, slug, name)),
      );
      const buffers: ProjectBuffer[] = files.map((file: ProjectFile) => ({
        name: file.name,
        savedContent: file.content,
        content: file.content,
      }));
      set({
        buffers,
        activeFileName: buffers[0]?.name ?? null,
        status: "ready",
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load project",
      });
    }
  },

  setActiveFile: (name) => {
    if (get().buffers.some((b) => b.name === name)) {
      set({ activeFileName: name });
    }
  },

  updateBuffer: (name, content) => {
    set((s) => ({
      buffers: s.buffers.map((b) => (b.name === name ? { ...b, content } : b)),
    }));
  },

  save: async (name) => {
    const { profileId, slug, buffers } = get();
    if (!profileId || !slug) {
      throw new Error("No project loaded");
    }
    const buffer = buffers.find((b) => b.name === name);
    if (!buffer) {
      throw new Error(`Unknown file: ${name}`);
    }
    await window.hibit.writeProjectFile(profileId, slug, name, buffer.content);
    set((s) => ({
      buffers: s.buffers.map((b) => (b.name === name ? { ...b, savedContent: b.content } : b)),
    }));
  },

  createFile: async (name, content) => {
    const { profileId, slug, buffers } = get();
    if (!profileId || !slug) {
      throw new Error("No project loaded");
    }
    if (buffers.some((b) => b.name === name)) {
      throw new Error(`File already exists: ${name}`);
    }
    await window.hibit.writeProjectFile(profileId, slug, name, content);
    set((s) => ({
      buffers: [...s.buffers, { name, savedContent: content, content }].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      activeFileName: name,
    }));
  },

  subscribe: async () => {
    const { profileId, slug } = get();
    if (!profileId || !slug) return;
    if (activeSubscription) {
      await activeSubscription.close();
      activeSubscription = null;
    }
    const handle = await window.hibit.subscribeProjectFiles(profileId, slug, (change) => {
      void handleProjectFileChange(change);
    });
    activeSubscription = handle;
    set({ subscriptionId: handle.id });
  },

  unsubscribe: async () => {
    if (!activeSubscription) return;
    await activeSubscription.close();
    activeSubscription = null;
    set({ subscriptionId: null });
  },

  openFolder: async () => {
    const { profileId, slug } = get();
    if (!profileId || !slug) {
      return { ok: false, path: "", error: "No project loaded" };
    }
    return window.hibit.openProjectFolder(profileId, slug);
  },

  reset: () => {
    if (activeSubscription) {
      void activeSubscription.close();
      activeSubscription = null;
    }
    set({
      profileId: null,
      slug: null,
      buffers: [],
      activeFileName: null,
      status: "idle",
      error: null,
      subscriptionId: null,
    });
  },
}));

async function handleProjectFileChange(change: ProjectFileChange): Promise<void> {
  const { profileId, slug, buffers } = useProjectsStore.getState();
  if (!profileId || !slug) return;

  const existing = buffers.find((b) => b.name === change.filename);

  let fresh: ProjectFile | null = null;
  try {
    fresh = await window.hibit.readProjectFile(profileId, slug, change.filename);
  } catch {
    fresh = null;
  }

  if (fresh) {
    if (existing) {
      useProjectsStore.setState((s) => ({
        buffers: s.buffers.map((b) => {
          if (b.name !== change.filename) return b;
          const dirty = isDirty(b);
          return {
            ...b,
            savedContent: fresh.content,
            content: dirty ? b.content : fresh.content,
          };
        }),
      }));
    } else {
      useProjectsStore.setState((s) => ({
        buffers: [
          ...s.buffers,
          { name: fresh.name, savedContent: fresh.content, content: fresh.content },
        ].sort((a, b) => a.name.localeCompare(b.name)),
        activeFileName: s.activeFileName ?? fresh.name,
      }));
    }
    return;
  }

  if (existing) {
    useProjectsStore.setState((s) => {
      const nextBuffers = s.buffers.filter((b) => b.name !== change.filename);
      const nextActive =
        s.activeFileName === change.filename ? (nextBuffers[0]?.name ?? null) : s.activeFileName;
      return { buffers: nextBuffers, activeFileName: nextActive };
    });
  }
}
