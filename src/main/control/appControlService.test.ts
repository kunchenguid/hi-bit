import type { SpotlightRect } from "@shared/browser";
import { describe, expect, it, vi } from "vitest";
import { AppControlService } from "./appControlService";
import { NavigationBlockedError } from "./browserHost";

function makeService(allowlist: string[] = ["wikipedia.org"]) {
  const broadcasts: Array<{ channel: string; payload: unknown }> = [];
  const saved: string[][] = [];
  const service = new AppControlService({
    getAppDebugger: () => null,
    getAppWebContentsId: () => null,
    captureApp: async () => "PNG",
    broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
    createHeadlessWindow: () => {
      throw new Error("not used");
    },
    loadAllowlist: async () => [...allowlist],
    saveAllowlist: async (domains) => {
      saved.push([...domains]);
    },
  });
  return { service, broadcasts, saved };
}

describe("AppControlService allowlist", () => {
  it("adds, normalizes, and persists a domain", async () => {
    const { service, saved } = makeService([]);
    const next = await service.addAllowedDomain("HTTPS://www.NASA.gov/foo");
    expect(next).toContain("nasa.gov");
    expect(saved.at(-1)).toContain("nasa.gov");
  });

  it("removes a domain and persists", async () => {
    const { service, saved } = makeService(["wikipedia.org", "nasa.gov"]);
    const next = await service.removeAllowedDomain("nasa.gov");
    expect(next).toEqual(["wikipedia.org"]);
    expect(saved.at(-1)).toEqual(["wikipedia.org"]);
  });

  it("loads only once under concurrent callers (no double first-run seed)", async () => {
    let loadCount = 0;
    const service = new AppControlService({
      getAppDebugger: () => null,
      getAppWebContentsId: () => null,
      captureApp: async () => null,
      broadcast: () => {},
      createHeadlessWindow: () => {
        throw new Error("not used");
      },
      loadAllowlist: async () => {
        loadCount++;
        return ["wikipedia.org"];
      },
      saveAllowlist: async () => {},
    });
    // Two IPC calls racing on startup (e.g. React StrictMode double-invokes the
    // settings effect) must share one load, not each trigger their own.
    const [a, b] = await Promise.all([service.listAllowedDomains(), service.listAllowedDomains()]);
    expect(a).toEqual(["wikipedia.org"]);
    expect(b).toEqual(["wikipedia.org"]);
    expect(loadCount).toBe(1);
  });
});

describe("AppControlService visible browser", () => {
  it("refuses opening an off-allowlist website", async () => {
    const { service } = makeService();
    await expect(service.browserHost.openTab("https://evil.com/")).rejects.toBeInstanceOf(
      NavigationBlockedError,
    );
  });

  it("opens (and broadcasts) a creation tab via Play", async () => {
    const { service, broadcasts } = makeService();
    const state = await service.playInTab("http://127.0.0.1:4310/", "Snake");
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ url: "http://127.0.0.1:4310/", kind: "creation" });
    expect(broadcasts.some((b) => b.channel === "hibit:browser:state")).toBe(true);
  });

  it("focuses an existing creation tab instead of duplicating it", async () => {
    const { service } = makeService();
    await service.playInTab("http://127.0.0.1:4310/", "Snake");
    const state = await service.playInTab("http://127.0.0.1:4310/", "Snake");
    expect(state.tabs).toHaveLength(1);
  });

  it("drops a now-disallowed external tab on restore", async () => {
    const { service } = makeService(["wikipedia.org"]);
    await service.restore({
      tabs: [
        { id: "a", url: "https://wikipedia.org/", kind: "web" },
        { id: "b", url: "https://evil.com/", kind: "web" },
        { id: "c", url: "http://127.0.0.1:4310/", kind: "creation" },
      ],
      activeTabId: "b",
    });
    const state = service.state();
    expect(state.tabs.map((t) => t.id).sort()).toEqual(["a", "c"]);
    // The active id pointed at the dropped tab, so it falls back to a kept one.
    expect(state.activeTabId).not.toBe("b");
  });

  it("loads the allowlist before constructing a headless browser", async () => {
    const service = new AppControlService({
      getAppDebugger: () => null,
      getAppWebContentsId: () => null,
      captureApp: async () => null,
      broadcast: () => {},
      createHeadlessWindow: () => {
        throw new Error("not used");
      },
      loadAllowlist: vi.fn(async () => ["wikipedia.org"]),
      saveAllowlist: async () => {},
    });

    const host = await service.createHeadlessBrowser();

    await expect(host.openTab("https://wikipedia.org/")).rejects.not.toBeInstanceOf(
      NavigationBlockedError,
    );
  });

  it("validates and snapshots only the active browser frame", async () => {
    const { service } = makeService(["wikipedia.org"]);
    await service.restore({
      tabs: [{ id: "active", url: "https://wikipedia.org/", kind: "web" }],
      activeTabId: "active",
    });
    const controller = {
      isAttached: () => true,
      firstDisallowedFrameUrl: vi.fn(async () => null),
      findFrameKeyByUrl: vi.fn(async () => "frame-active"),
      snapshotFrame: vi.fn(async () => "active snapshot"),
      snapshot: vi.fn(async () => "all snapshots"),
    };
    Object.assign(service as unknown as { controller: unknown; controllerWcId: number }, {
      controller,
      controllerWcId: 1,
    });
    Object.assign(service as unknown as { deps: Record<string, unknown> }, {
      deps: {
        ...(service as unknown as { deps: Record<string, unknown> }).deps,
        getAppWebContentsId: () => 1,
      },
    });

    await expect(service.browserHost.snapshot()).resolves.toBe("active snapshot");

    expect(controller.firstDisallowedFrameUrl).toHaveBeenCalledWith(expect.any(Function), "frame-active");
    expect(controller.snapshotFrame).toHaveBeenCalledWith("frame-active");
  });

  it("captures screenshots from only the active browser frame", async () => {
    const { service } = makeService(["wikipedia.org"]);
    await service.restore({
      tabs: [{ id: "active", url: "https://wikipedia.org/", kind: "web" }],
      activeTabId: "active",
    });
    const controller = {
      isAttached: () => true,
      firstDisallowedFrameUrl: vi.fn(async () => null),
      findFrameKeyByUrl: vi.fn(async () => "frame-active"),
      screenshotFrame: vi.fn(async () => "FRAME_PNG"),
    };
    Object.assign(service as unknown as { controller: unknown; controllerWcId: number }, {
      controller,
      controllerWcId: 1,
    });
    Object.assign(service as unknown as { deps: Record<string, unknown> }, {
      deps: {
        ...(service as unknown as { deps: Record<string, unknown> }).deps,
        captureApp: vi.fn(async () => "APP_PNG"),
        getAppWebContentsId: () => 1,
      },
    });

    await expect(service.browserHost.screenshot()).resolves.toBe("FRAME_PNG");

    expect(controller.screenshotFrame).toHaveBeenCalledWith("frame-active");
  });
});

describe("AppControlService spotlight", () => {
  it("clears the spotlight by broadcasting null", async () => {
    const { service, broadcasts } = makeService();
    await service.appSurface.clearHighlight();
    const last = broadcasts.at(-1);
    expect(last?.channel).toBe("hibit:browser:spotlight");
    expect(last?.payload as SpotlightRect | null).toBeNull();
  });

  it("returns false from highlight when there's no window to resolve a ref", async () => {
    const { service } = makeService();
    // No app debugger is configured, so resolving a ref can't succeed.
    expect(await service.appSurface.highlight("e1", "Tap here")).toBe(false);
  });
});

describe("AppControlService tab loaded", () => {
  it("resolves a pending navigate when the renderer reports the tab loaded", async () => {
    const { service } = makeService();
    const tabPromise = service.playInTab("http://127.0.0.1:4310/", "Snake");
    const state = await tabPromise;
    const tabId = state.tabs[0].id;
    // Reporting load updates the title; no throw, and state reflects it.
    await service.onTabLoaded(tabId, "http://127.0.0.1:4310/", "Snake Game");
    expect(service.state().tabs[0].title).toBe("Snake Game");
  });

  it("stores the committed frame URL after a redirect", async () => {
    const { service } = makeService(["wikipedia.org"]);
    await service.restore({
      tabs: [{ id: "active", url: "https://wikipedia.org/start", kind: "web" }],
      activeTabId: "active",
    });
    const controller = {
      isAttached: () => true,
      findFrameKeyByUrl: vi.fn(async () => undefined),
      childFrameUrls: vi.fn(async () => [
        { frameKey: "frame-active", url: "https://wikipedia.org/redirected" },
      ]),
    };
    Object.assign(service as unknown as { controller: unknown; controllerWcId: number }, {
      controller,
      controllerWcId: 1,
    });
    Object.assign(service as unknown as { deps: Record<string, unknown> }, {
      deps: {
        ...(service as unknown as { deps: Record<string, unknown> }).deps,
        getAppWebContentsId: () => 1,
      },
    });

    await service.onTabLoaded("active", "https://wikipedia.org/start");

    expect(service.state().tabs[0].url).toBe("https://wikipedia.org/redirected");
  });
});
