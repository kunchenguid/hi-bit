import type { SpotlightRect } from "@shared/browser";
import { describe, expect, it, vi } from "vitest";
import { AppControlService } from "./appControlService";
import { NavigationBlockedError } from "./browserHost";
import type { CdpDebugger } from "./cdpController";
import type { HeadlessWindow } from "./headlessBrowser";

function fakeDebugger(): CdpDebugger {
  return {
    isAttached: () => false,
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn(async () => ({})),
    on: vi.fn(),
  };
}

function fakeHeadlessWindow(): HeadlessWindow {
  let currentUrl = "";
  return {
    debugger: fakeDebugger(),
    capture: async () => null,
    loadURL: async (url) => {
      currentUrl = url;
    },
    currentUrl: () => currentUrl,
    title: () => "Headless",
    destroy: () => {},
  };
}

function makeService() {
  const broadcasts: Array<{ channel: string; payload: unknown }> = [];
  const service = new AppControlService({
    getAppDebugger: () => null,
    getAppWebContentsId: () => null,
    captureApp: async () => "PNG",
    broadcast: (channel, payload) => broadcasts.push({ channel, payload }),
    createHeadlessWindow: () => {
      throw new Error("not used");
    },
  });
  return { service, broadcasts };
}

describe("AppControlService visible browser", () => {
  it("refuses to open an external website", async () => {
    const { service } = makeService();
    await expect(service.browserHost.openTab("https://wikipedia.org/")).rejects.toBeInstanceOf(
      NavigationBlockedError,
    );
    expect(service.state().tabs).toHaveLength(0);
  });

  it("opens a creation's own loopback preview", async () => {
    const { service } = makeService();
    const opened = service.browserHost.openTab("http://127.0.0.1:4310/");
    await Promise.resolve();
    const tabId = service.state().tabs[0]?.id;
    if (tabId) await service.onTabLoaded(tabId, "http://127.0.0.1:4310/");
    const tab = await opened;

    expect(tab).toMatchObject({ url: "http://127.0.0.1:4310/", kind: "creation" });
  });

  it("focuses an existing loopback tab instead of duplicating it", async () => {
    const { service } = makeService();
    await service.playInTab("http://127.0.0.1:4310/", "Snake");
    const controller = {
      isAttached: () => true,
      findFrameKeyByUrl: vi.fn(async () => "frame-active"),
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

    await service.browserHost.openTab("http://127.0.0.1:4310/");

    expect(service.state().tabs).toHaveLength(1);
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

  it("drops external tabs on restore, keeping only loopback creations", async () => {
    const { service } = makeService();
    await service.restore({
      tabs: [
        { id: "a", url: "https://wikipedia.org/", kind: "web" },
        { id: "b", url: "https://evil.com/", kind: "web" },
        { id: "c", url: "http://127.0.0.1:4310/", kind: "creation" },
      ],
      activeTabId: "b",
    });
    const state = service.state();
    expect(state.tabs.map((t) => t.id)).toEqual(["c"]);
    // The active id pointed at a dropped tab, so it falls back to the kept one.
    expect(state.activeTabId).toBe("c");
  });

  it("constructs a headless browser that refuses external websites", async () => {
    const service = new AppControlService({
      getAppDebugger: () => null,
      getAppWebContentsId: () => null,
      captureApp: async () => null,
      broadcast: () => {},
      createHeadlessWindow: fakeHeadlessWindow,
    });

    const host = service.createHeadlessBrowser();

    await expect(host.openTab("https://wikipedia.org/")).rejects.toBeInstanceOf(
      NavigationBlockedError,
    );
    await expect(host.openTab("http://127.0.0.1:5000/")).resolves.toMatchObject({
      url: "http://127.0.0.1:5000/",
    });
  });

  it("validates and snapshots only the active browser frame", async () => {
    const { service } = makeService();
    await service.restore({
      tabs: [{ id: "active", url: "http://127.0.0.1:4310/", kind: "creation" }],
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

    expect(controller.firstDisallowedFrameUrl).toHaveBeenCalledWith(
      expect.any(Function),
      "frame-active",
    );
    expect(controller.snapshotFrame).toHaveBeenCalledWith("frame-active");
  });

  it("captures screenshots from only the active browser frame", async () => {
    const { service } = makeService();
    await service.restore({
      tabs: [{ id: "active", url: "http://127.0.0.1:4310/", kind: "creation" }],
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

  it("rejects browser tools when the active tab frame cannot be matched", async () => {
    const { service } = makeService();
    await service.restore({
      tabs: [{ id: "active", url: "http://127.0.0.1:4310/", kind: "creation" }],
      activeTabId: "active",
    });
    const controller = {
      isAttached: () => true,
      findFrameKeyByUrl: vi.fn(async () => undefined),
      childFrameUrls: vi.fn(async () => [{ frameKey: "frame-redirect", url: "https://evil.com/" }]),
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

    await expect(service.browserHost.snapshot()).rejects.toBeInstanceOf(NavigationBlockedError);
  });

  it("stores the committed loopback frame URL after a redirect", async () => {
    const { service } = makeService();
    await service.restore({
      tabs: [{ id: "active", url: "http://127.0.0.1:4310/start", kind: "creation" }],
      activeTabId: "active",
    });
    const controller = {
      isAttached: () => true,
      findFrameKeyByUrl: vi.fn(async () => undefined),
      childFrameUrls: vi.fn(async () => [
        { frameKey: "frame-active", url: "http://127.0.0.1:4310/redirected" },
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

    await service.onTabLoaded("active", "http://127.0.0.1:4310/start");

    expect(service.state().tabs[0].url).toBe("http://127.0.0.1:4310/redirected");
  });
});
