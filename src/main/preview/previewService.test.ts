import { describe, expect, it } from "vitest";
import { type PreviewChild, PreviewService, type SpawnLike } from "./previewService";

/** A spawned child stand-in: records the kill signal, never touches a real process. */
function fakeChild(): PreviewChild & { killed: boolean } {
  const child = {
    pid: undefined,
    killed: false,
    kill(_signal?: NodeJS.Signals | number) {
      child.killed = true;
      return true;
    },
    on() {},
  };
  return child;
}

type Harness = {
  service: PreviewService;
  spawns: Array<{ command: string; cwd: string; env: NodeJS.ProcessEnv }>;
  children: Array<PreviewChild & { killed: boolean }>;
  ports: number[];
  waited: number[];
};

function createService(overrides: { failHealthCheck?: boolean } = {}): Harness {
  const spawns: Harness["spawns"] = [];
  const children: Harness["children"] = [];
  const ports = [4310, 4311, 4312];
  const waited: number[] = [];
  let portIndex = 0;
  const spawn: SpawnLike = (command, options) => {
    spawns.push({ command, ...options });
    const child = fakeChild();
    children.push(child);
    return child;
  };
  const service = new PreviewService({
    resolveWorkbenchDir: (profileId, projectId) => `/work/${profileId}/${projectId}`,
    spawn,
    findFreePort: async () => ports[portIndex++] ?? 4399,
    waitForPort: async (port) => {
      waited.push(port);
      if (overrides.failHealthCheck) throw new Error("port never answered");
    },
    now: () => new Date("2026-05-27T10:00:00.000Z"),
  });
  return { service, spawns, children, ports, waited };
}

describe("PreviewService", () => {
  it("allocates a port, spawns the command in the workbench with PORT injected, and lists it", async () => {
    const h = createService();

    const info = await h.service.start("ada", "project_1", "python3 -m http.server", "Snake Game");

    expect(info).toEqual({
      projectId: "project_1",
      title: "Snake Game",
      url: "http://127.0.0.1:4310/",
      startedAt: "2026-05-27T10:00:00.000Z",
    });
    expect(h.spawns).toHaveLength(1);
    expect(h.spawns[0]?.command).toBe("python3 -m http.server");
    expect(h.spawns[0]?.cwd).toBe("/work/ada/project_1");
    expect(h.spawns[0]?.env.PORT).toBe("4310");
    expect(h.waited).toEqual([4310]);
    expect(h.service.list("ada")).toEqual([info]);
  });

  it("is idempotent: a repeat start for a running creation returns the existing url without respawning", async () => {
    const h = createService();

    const first = await h.service.start("ada", "project_1", "cmd");
    const second = await h.service.start("ada", "project_1", "cmd-again");

    expect(second).toEqual(first);
    expect(h.spawns).toHaveLength(1);
  });

  it("stops a specific preview, killing the process and dropping it from the list", async () => {
    const h = createService();
    await h.service.start("ada", "project_1", "cmd");

    const stopped = h.service.stop("project_1");

    expect(stopped).toBe(true);
    expect(h.children[0]?.killed).toBe(true);
    expect(h.service.list("ada")).toEqual([]);
  });

  it("reports stop of an unknown creation as a no-op", () => {
    const h = createService();
    expect(h.service.stop("nope")).toBe(false);
  });

  it("scopes list to a profile", async () => {
    const h = createService();
    await h.service.start("ada", "project_1", "cmd");
    await h.service.start("sam", "project_2", "cmd");

    expect(h.service.list("ada").map((p) => p.projectId)).toEqual(["project_1"]);
    expect(h.service.list("sam").map((p) => p.projectId)).toEqual(["project_2"]);
  });

  it("kills every server on stopAll (the quit safety net)", async () => {
    const h = createService();
    await h.service.start("ada", "project_1", "cmd");
    await h.service.start("ada", "project_2", "cmd");

    h.service.stopAll();

    expect(h.children.every((child) => child.killed)).toBe(true);
    expect(h.service.list("ada")).toEqual([]);
  });

  it("kills the child and does not list a preview whose health-check fails", async () => {
    const h = createService({ failHealthCheck: true });

    await expect(h.service.start("ada", "project_1", "cmd")).rejects.toThrow("port never answered");

    expect(h.children[0]?.killed).toBe(true);
    expect(h.service.list("ada")).toEqual([]);
  });

  it("drops a preview from the list when its process exits on its own", async () => {
    const exitListeners: Array<() => void> = [];
    const spawn: SpawnLike = () => ({
      pid: undefined,
      kill: () => true,
      on: (event, listener) => {
        if (event === "exit") exitListeners.push(listener as () => void);
      },
    });
    const service = new PreviewService({
      resolveWorkbenchDir: () => "/work",
      spawn,
      findFreePort: async () => 4310,
      waitForPort: async () => {},
    });

    await service.start("ada", "project_1", "cmd");
    expect(service.list("ada")).toHaveLength(1);

    exitListeners[0]?.();
    expect(service.list("ada")).toEqual([]);
  });
});
