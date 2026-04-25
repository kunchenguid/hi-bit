import type { ProjectFile } from "@shared/project";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useParentProjectsStore } from "./parentProjectsStore";

type HiBitApi = typeof window.hibit;

function mockHiBit(partial: Partial<HiBitApi>): void {
  (globalThis as unknown as { window: { hibit: HiBitApi } }).window = {
    hibit: {
      getAppInfo: vi.fn(),
      listProfiles: vi.fn(),
      createProfile: vi.fn(),
      listProjectSlugs: vi.fn(),
      listProjectFiles: vi.fn(),
      readProjectFile: vi.fn(),
      writeProjectFile: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

function fakeFile(name: string, content: string): ProjectFile {
  return { name, content };
}

beforeEach(() => {
  useParentProjectsStore.getState().reset();
});

describe("useParentProjectsStore", () => {
  it("loads project slugs for a profile", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card", "pet-page"]),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");

    const state = useParentProjectsStore.getState();
    expect(state.status).toBe("ready");
    expect(state.profileId).toBe("ada");
    expect(state.slugs).toEqual(["hello-card", "pet-page"]);
    expect(state.error).toBeNull();
  });

  it("surfaces an IPC error when loading slugs fails", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockRejectedValue(new Error("fs failed")),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");

    const state = useParentProjectsStore.getState();
    expect(state.status).toBe("error");
    expect(state.slugs).toEqual([]);
    expect(state.error).toBe("fs failed");
  });

  it("loads files and contents for an active project slug", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card"]),
      listProjectFiles: vi.fn().mockResolvedValue(["index.html", "style.css"]),
      readProjectFile: vi.fn(async (_p, _s, name) => fakeFile(name, `content-${name}`)),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    await useParentProjectsStore.getState().openProject("hello-card");

    const state = useParentProjectsStore.getState();
    expect(state.activeSlug).toBe("hello-card");
    expect(state.fileStatus).toBe("ready");
    expect(state.files).toEqual([
      { name: "index.html", content: "content-index.html" },
      { name: "style.css", content: "content-style.css" },
    ]);
    expect(state.activeFileName).toBe("index.html");
  });

  it("handles an empty project without error", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["empty"]),
      listProjectFiles: vi.fn().mockResolvedValue([]),
      readProjectFile: vi.fn(),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    await useParentProjectsStore.getState().openProject("empty");

    const state = useParentProjectsStore.getState();
    expect(state.fileStatus).toBe("ready");
    expect(state.files).toEqual([]);
    expect(state.activeFileName).toBeNull();
  });

  it("surfaces an error when loading project files fails", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card"]),
      listProjectFiles: vi.fn().mockRejectedValue(new Error("no dir")),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    await useParentProjectsStore.getState().openProject("hello-card");

    const state = useParentProjectsStore.getState();
    expect(state.fileStatus).toBe("error");
    expect(state.files).toEqual([]);
    expect(state.fileError).toBe("no dir");
  });

  it("setActiveFile switches the active file when it exists", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card"]),
      listProjectFiles: vi.fn().mockResolvedValue(["index.html", "style.css"]),
      readProjectFile: vi.fn(async (_p, _s, name) => fakeFile(name, `content-${name}`)),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    await useParentProjectsStore.getState().openProject("hello-card");
    useParentProjectsStore.getState().setActiveFile("style.css");

    expect(useParentProjectsStore.getState().activeFileName).toBe("style.css");
  });

  it("setActiveFile ignores unknown file names", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card"]),
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn(async (_p, _s, name) => fakeFile(name, "<!-- -->")),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    await useParentProjectsStore.getState().openProject("hello-card");
    useParentProjectsStore.getState().setActiveFile("missing.css");

    expect(useParentProjectsStore.getState().activeFileName).toBe("index.html");
  });

  it("closeProject clears the active project without clearing slugs", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card", "pet-page"]),
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn(async (_p, _s, name) => fakeFile(name, "<!-- -->")),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    await useParentProjectsStore.getState().openProject("hello-card");
    useParentProjectsStore.getState().closeProject();

    const state = useParentProjectsStore.getState();
    expect(state.slugs).toEqual(["hello-card", "pet-page"]);
    expect(state.activeSlug).toBeNull();
    expect(state.files).toEqual([]);
    expect(state.activeFileName).toBeNull();
    expect(state.fileStatus).toBe("idle");
  });

  it("reset clears all state", async () => {
    mockHiBit({
      listProjectSlugs: vi.fn().mockResolvedValue(["hello-card"]),
    });

    await useParentProjectsStore.getState().loadSlugs("ada");
    useParentProjectsStore.getState().reset();

    const state = useParentProjectsStore.getState();
    expect(state.profileId).toBeNull();
    expect(state.slugs).toEqual([]);
    expect(state.status).toBe("idle");
  });
});
