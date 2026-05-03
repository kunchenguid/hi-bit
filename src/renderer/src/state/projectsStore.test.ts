import type { ProjectFile, ProjectFileChange } from "@shared/project";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bufferDirty, useProjectsStore } from "./projectsStore";

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
      subscribeProjectFiles: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

function fakeFile(name: string, content: string): ProjectFile {
  return { name, content };
}

beforeEach(() => {
  useProjectsStore.getState().reset();
});

describe("useProjectsStore", () => {
  it("loads all project files and sets the first as active", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html", "style.css"]),
      readProjectFile: vi.fn(async (_p, _s, name) => fakeFile(name, `<!-- ${name} -->`)),
    });

    await useProjectsStore.getState().load("ada", "snake");

    const state = useProjectsStore.getState();
    expect(state.status).toBe("ready");
    expect(state.profileId).toBe("ada");
    expect(state.slug).toBe("snake");
    expect(state.buffers).toHaveLength(2);
    expect(state.buffers.map((b) => b.name)).toEqual(["index.html", "style.css"]);
    expect(state.activeFileName).toBe("index.html");
  });

  it("handles an empty project directory without error", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue([]),
      readProjectFile: vi.fn(),
    });

    await useProjectsStore.getState().load("ada", "snake");

    const state = useProjectsStore.getState();
    expect(state.status).toBe("ready");
    expect(state.buffers).toEqual([]);
    expect(state.activeFileName).toBeNull();
  });

  it("preserves dirty buffers when load() is called again for the same profile and slug", async () => {
    const listProjectFiles = vi.fn().mockResolvedValue(["index.html"]);
    const readProjectFile = vi.fn().mockResolvedValue(fakeFile("index.html", "<p>v1</p>"));
    mockHiBit({ listProjectFiles, readProjectFile });

    await useProjectsStore.getState().load("ada", "snake");
    useProjectsStore.getState().updateBuffer("index.html", "<p>dirty</p>");

    await useProjectsStore.getState().load("ada", "snake");

    const state = useProjectsStore.getState();
    expect(state.buffers[0]?.content).toBe("<p>dirty</p>");
    expect(state.buffers[0]?.savedContent).toBe("<p>v1</p>");
    expect(bufferDirty(state, "index.html")).toBe(true);
    expect(listProjectFiles).toHaveBeenCalledTimes(1);
    expect(readProjectFile).toHaveBeenCalledTimes(1);
  });

  it("reloads buffers when load() is called with a different profile id", async () => {
    const listProjectFiles = vi.fn().mockResolvedValue(["index.html"]);
    const readProjectFile = vi.fn(async (_p, _s, name) => fakeFile(name, "<p>v1</p>"));
    mockHiBit({ listProjectFiles, readProjectFile });

    await useProjectsStore.getState().load("ada", "snake");
    useProjectsStore.getState().updateBuffer("index.html", "<p>dirty</p>");

    await useProjectsStore.getState().load("ben", "snake");

    const state = useProjectsStore.getState();
    expect(state.profileId).toBe("ben");
    expect(state.buffers[0]?.content).toBe("<p>v1</p>");
    expect(bufferDirty(state, "index.html")).toBe(false);
    expect(listProjectFiles).toHaveBeenCalledTimes(2);
  });

  it("reloads buffers when load() is called with a different slug", async () => {
    const listProjectFiles = vi.fn().mockResolvedValue(["index.html"]);
    const readProjectFile = vi.fn(async (_p, _s, name) => fakeFile(name, "<p>v1</p>"));
    mockHiBit({ listProjectFiles, readProjectFile });

    await useProjectsStore.getState().load("ada", "snake");
    useProjectsStore.getState().updateBuffer("index.html", "<p>dirty</p>");

    await useProjectsStore.getState().load("ada", "pong");

    const state = useProjectsStore.getState();
    expect(state.slug).toBe("pong");
    expect(state.buffers[0]?.content).toBe("<p>v1</p>");
    expect(bufferDirty(state, "index.html")).toBe(false);
    expect(listProjectFiles).toHaveBeenCalledTimes(2);
  });

  it("captures an error when listProjectFiles rejects", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockRejectedValue(new Error("fs down")),
    });

    await useProjectsStore.getState().load("ada", "snake");

    const state = useProjectsStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("fs down");
  });

  it("updateBuffer marks the file as dirty without touching savedContent", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("index.html", "<p>v1</p>")),
    });
    await useProjectsStore.getState().load("ada", "snake");

    useProjectsStore.getState().updateBuffer("index.html", "<p>v2</p>");

    const state = useProjectsStore.getState();
    const buffer = state.buffers[0];
    expect(buffer?.content).toBe("<p>v2</p>");
    expect(buffer?.savedContent).toBe("<p>v1</p>");
    expect(bufferDirty(state, "index.html")).toBe(true);
  });

  it("save writes the current buffer to disk, clears the dirty flag, and returns the saved diff", async () => {
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("index.html", "<p>v1</p>")),
      writeProjectFile,
    });
    await useProjectsStore.getState().load("ada", "snake");
    useProjectsStore.getState().updateBuffer("index.html", "<p>v2</p>");

    const saved = await useProjectsStore.getState().save("index.html");

    expect(writeProjectFile).toHaveBeenCalledWith("ada", "snake", "index.html", "<p>v2</p>");
    expect(saved).toEqual({
      profileId: "ada",
      slug: "snake",
      filename: "index.html",
      before: "<p>v1</p>",
      after: "<p>v2</p>",
    });
    const state = useProjectsStore.getState();
    const buffer = state.buffers[0];
    expect(buffer?.savedContent).toBe("<p>v2</p>");
    expect(bufferDirty(state, "index.html")).toBe(false);
  });

  it("save throws when no project is loaded", async () => {
    mockHiBit({});
    await expect(useProjectsStore.getState().save("index.html")).rejects.toThrow(
      /No project loaded/,
    );
  });

  it("createFile writes, appends to buffers sorted, and activates the new file", async () => {
    const writeProjectFile = vi.fn().mockResolvedValue(undefined);
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["style.css"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("style.css", "body {}")),
      writeProjectFile,
    });
    await useProjectsStore.getState().load("ada", "snake");

    await useProjectsStore.getState().createFile("index.html", "<!doctype html>");

    expect(writeProjectFile).toHaveBeenCalledWith("ada", "snake", "index.html", "<!doctype html>");
    const state = useProjectsStore.getState();
    expect(state.buffers.map((b) => b.name)).toEqual(["index.html", "style.css"]);
    expect(state.activeFileName).toBe("index.html");
    expect(bufferDirty(state, "index.html")).toBe(false);
  });

  it("createFile rejects when a file with the same name already exists", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("index.html", "<p/>")),
      writeProjectFile: vi.fn(),
    });
    await useProjectsStore.getState().load("ada", "snake");

    await expect(useProjectsStore.getState().createFile("index.html", "<p/>")).rejects.toThrow(
      /already exists/,
    );
  });

  it("setActiveFile only switches to known buffers", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html", "style.css"]),
      readProjectFile: vi.fn(async (_p, _s, name) => fakeFile(name, "")),
    });
    await useProjectsStore.getState().load("ada", "snake");

    useProjectsStore.getState().setActiveFile("style.css");
    expect(useProjectsStore.getState().activeFileName).toBe("style.css");

    useProjectsStore.getState().setActiveFile("does-not-exist.js");
    expect(useProjectsStore.getState().activeFileName).toBe("style.css");
  });

  it("subscribe calls subscribeProjectFiles with the loaded profile/slug", async () => {
    const closeFn = vi.fn().mockResolvedValue(undefined);
    const subscribeProjectFiles = vi.fn().mockResolvedValue({ id: 1, close: closeFn });
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("index.html", "<p/>")),
      subscribeProjectFiles,
    });
    await useProjectsStore.getState().load("ada", "snake");

    await useProjectsStore.getState().subscribe();

    expect(subscribeProjectFiles).toHaveBeenCalledWith("ada", "snake", expect.any(Function));
    expect(useProjectsStore.getState().subscriptionId).toBe(1);
  });

  it("subscribe is a no-op when no project is loaded", async () => {
    const subscribeProjectFiles = vi.fn();
    mockHiBit({ subscribeProjectFiles });

    await useProjectsStore.getState().subscribe();

    expect(subscribeProjectFiles).not.toHaveBeenCalled();
    expect(useProjectsStore.getState().subscriptionId).toBeNull();
  });

  it("changed event reloads a clean buffer's content and savedContent", async () => {
    const dispatch: { current: ((change: ProjectFileChange) => void) | null } = { current: null };
    const subscribeProjectFiles = vi.fn(
      async (_p: string, _s: string, cb: (change: ProjectFileChange) => void) => {
        dispatch.current = cb;
        return { id: 1, close: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const readProjectFile = vi
      .fn()
      .mockResolvedValueOnce(fakeFile("index.html", "<p>v1</p>"))
      .mockResolvedValueOnce(fakeFile("index.html", "<p>v2</p>"));
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile,
      subscribeProjectFiles,
    });
    await useProjectsStore.getState().load("ada", "snake");
    await useProjectsStore.getState().subscribe();

    dispatch.current?.({ kind: "changed", filename: "index.html" });
    await vi.waitFor(() => {
      expect(useProjectsStore.getState().buffers[0]?.content).toBe("<p>v2</p>");
    });

    const buffer = useProjectsStore.getState().buffers[0];
    expect(buffer?.savedContent).toBe("<p>v2</p>");
    expect(buffer?.content).toBe("<p>v2</p>");
  });

  it("changed event preserves a dirty buffer's content but updates savedContent", async () => {
    const dispatch: { current: ((change: ProjectFileChange) => void) | null } = { current: null };
    const subscribeProjectFiles = vi.fn(
      async (_p: string, _s: string, cb: (change: ProjectFileChange) => void) => {
        dispatch.current = cb;
        return { id: 1, close: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const readProjectFile = vi
      .fn()
      .mockResolvedValueOnce(fakeFile("index.html", "<p>v1</p>"))
      .mockResolvedValueOnce(fakeFile("index.html", "<p>v2</p>"));
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile,
      subscribeProjectFiles,
    });
    await useProjectsStore.getState().load("ada", "snake");
    await useProjectsStore.getState().subscribe();
    useProjectsStore.getState().updateBuffer("index.html", "<p>dirty</p>");

    dispatch.current?.({ kind: "changed", filename: "index.html" });
    await vi.waitFor(() => {
      expect(useProjectsStore.getState().buffers[0]?.savedContent).toBe("<p>v2</p>");
    });

    const buffer = useProjectsStore.getState().buffers[0];
    expect(buffer?.content).toBe("<p>dirty</p>");
    expect(bufferDirty(useProjectsStore.getState(), "index.html")).toBe(true);
  });

  it("renamed event adds a new file when it appears on disk", async () => {
    const dispatch: { current: ((change: ProjectFileChange) => void) | null } = { current: null };
    const subscribeProjectFiles = vi.fn(
      async (_p: string, _s: string, cb: (change: ProjectFileChange) => void) => {
        dispatch.current = cb;
        return { id: 1, close: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const readProjectFile = vi.fn(async (_p, _s, name: string) => {
      if (name === "index.html") return fakeFile(name, "<p/>");
      if (name === "style.css") return fakeFile(name, "body{}");
      throw new Error(`ENOENT: ${name}`);
    });
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile,
      subscribeProjectFiles,
    });
    await useProjectsStore.getState().load("ada", "snake");
    await useProjectsStore.getState().subscribe();

    dispatch.current?.({ kind: "renamed", filename: "style.css" });
    await vi.waitFor(() => {
      expect(useProjectsStore.getState().buffers).toHaveLength(2);
    });

    const names = useProjectsStore.getState().buffers.map((b) => b.name);
    expect(names).toEqual(["index.html", "style.css"]);
  });

  it("renamed event removes a buffer when the file is gone from disk", async () => {
    const dispatch: { current: ((change: ProjectFileChange) => void) | null } = { current: null };
    const subscribeProjectFiles = vi.fn(
      async (_p: string, _s: string, cb: (change: ProjectFileChange) => void) => {
        dispatch.current = cb;
        return { id: 1, close: vi.fn().mockResolvedValue(undefined) };
      },
    );
    const readProjectFile = vi.fn(async (_p, _s, name: string) => {
      if (name === "index.html") return fakeFile("index.html", "<p/>");
      throw new Error(`ENOENT: ${name}`);
    });
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html", "style.css"]),
      readProjectFile: vi.fn(async (_p, _s, name: string) => fakeFile(name, `/* ${name} */`)),
      subscribeProjectFiles,
    });
    await useProjectsStore.getState().load("ada", "snake");
    useProjectsStore.getState().setActiveFile("style.css");
    // swap the readProjectFile to the deletion-aware mock
    (
      (globalThis as unknown as { window: { hibit: HiBitApi } }).window.hibit
        .readProjectFile as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(readProjectFile);
    await useProjectsStore.getState().subscribe();

    dispatch.current?.({ kind: "renamed", filename: "style.css" });
    await vi.waitFor(() => {
      expect(useProjectsStore.getState().buffers.map((b) => b.name)).toEqual(["index.html"]);
    });

    expect(useProjectsStore.getState().activeFileName).toBe("index.html");
  });

  it("unsubscribe closes the subscription and clears subscriptionId", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("index.html", "<p/>")),
      subscribeProjectFiles: vi.fn().mockResolvedValue({ id: 7, close }),
    });
    await useProjectsStore.getState().load("ada", "snake");
    await useProjectsStore.getState().subscribe();

    await useProjectsStore.getState().unsubscribe();

    expect(close).toHaveBeenCalledTimes(1);
    expect(useProjectsStore.getState().subscriptionId).toBeNull();
  });

  it("reset also closes an active subscription", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue(["index.html"]),
      readProjectFile: vi.fn().mockResolvedValue(fakeFile("index.html", "<p/>")),
      subscribeProjectFiles: vi.fn().mockResolvedValue({ id: 7, close }),
    });
    await useProjectsStore.getState().load("ada", "snake");
    await useProjectsStore.getState().subscribe();

    useProjectsStore.getState().reset();

    expect(close).toHaveBeenCalledTimes(1);
    expect(useProjectsStore.getState().subscriptionId).toBeNull();
    expect(useProjectsStore.getState().profileId).toBeNull();
  });

  it("openFolder returns not-loaded when no project is active", async () => {
    const openProjectFolder = vi.fn();
    mockHiBit({ openProjectFolder });

    const result = await useProjectsStore.getState().openFolder();

    expect(result).toEqual({ ok: false, path: "", error: "No project loaded" });
    expect(openProjectFolder).not.toHaveBeenCalled();
  });

  it("openFolder delegates to hibit.openProjectFolder when a project is loaded", async () => {
    const openProjectFolder = vi
      .fn()
      .mockResolvedValue({ ok: true, path: "/tmp/ada/projects/snake" });
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue([]),
      readProjectFile: vi.fn(),
      openProjectFolder,
    });
    await useProjectsStore.getState().load("ada", "snake");

    const result = await useProjectsStore.getState().openFolder();

    expect(openProjectFolder).toHaveBeenCalledWith("ada", "snake");
    expect(result).toEqual({ ok: true, path: "/tmp/ada/projects/snake" });
  });

  it("openFolder propagates a failure result from the IPC", async () => {
    mockHiBit({
      listProjectFiles: vi.fn().mockResolvedValue([]),
      readProjectFile: vi.fn(),
      openProjectFolder: vi
        .fn()
        .mockResolvedValue({ ok: false, path: "/tmp/x", error: "no folder app" }),
    });
    await useProjectsStore.getState().load("ada", "snake");

    const result = await useProjectsStore.getState().openFolder();

    expect(result).toEqual({ ok: false, path: "/tmp/x", error: "no folder app" });
  });
});
