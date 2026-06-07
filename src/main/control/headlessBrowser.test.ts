import { describe, expect, it, vi } from "vitest";
import { NavigationBlockedError } from "./browserHost";
import type { CdpDebugger } from "./cdpController";
import { HeadlessBrowserHost, type HeadlessWindow } from "./headlessBrowser";

function fakeDebugger(): CdpDebugger {
  return {
    isAttached: () => false,
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn(async () => ({})),
    on: vi.fn(),
  };
}

function makeWindowFactory() {
  const windows: Array<{ url: string; destroyed: boolean }> = [];
  const createWindow = (): HeadlessWindow => {
    const state = { url: "", destroyed: false };
    windows.push(state);
    return {
      debugger: fakeDebugger(),
      capture: async () => null,
      loadURL: async (url) => {
        state.url = url;
      },
      currentUrl: () => state.url,
      title: () => "Headless",
      destroy: () => {
        state.destroyed = true;
      },
    };
  };
  return { windows, createWindow };
}

/**
 * Mirrors the real Electron behavior we reproduced: `webContents.debugger`
 * commands (`Page.enable` etc.) never resolve until the page has navigated and
 * committed a document. A window whose controller attaches before any load would
 * therefore hang forever - which is exactly how bots got stuck on
 * `browser_open_tab`.
 */
function makeOrderSensitiveFactory() {
  const events: string[] = [];
  const createWindow = (): HeadlessWindow => {
    let navigated = false;
    const dbg: CdpDebugger = {
      isAttached: () => false,
      attach: vi.fn(),
      detach: vi.fn(),
      on: vi.fn(),
      sendCommand: vi.fn((): Promise<Record<string, unknown>> => {
        events.push("sendCommand");
        // Hangs until a navigation has committed - the real CDP behavior.
        return navigated ? Promise.resolve({}) : new Promise(() => {});
      }),
    };
    return {
      debugger: dbg,
      capture: async () => null,
      loadURL: async (url) => {
        events.push(`loadURL:${url}`);
        navigated = true;
      },
      currentUrl: () => (navigated ? "http://127.0.0.1:5000/" : ""),
      title: () => "Headless",
      destroy: () => {},
    };
  };
  return { events, createWindow };
}

function makeStuckWindowFactory() {
  const windows: Array<{ destroyed: boolean }> = [];
  const createWindow = (): HeadlessWindow => {
    const state = { destroyed: false };
    windows.push(state);
    return {
      debugger: fakeDebugger(),
      capture: async () => null,
      // A page that accepts the connection but never finishes loading: the
      // promise never settles, exactly like Electron's loadURL on a stalled
      // creation preview.
      loadURL: () => new Promise<void>(() => {}),
      currentUrl: () => "http://127.0.0.1:5000/",
      title: () => "Headless",
      destroy: () => {
        state.destroyed = true;
      },
    };
  };
  return { windows, createWindow };
}

function makeRejectingWindowFactory() {
  const windows: Array<{ destroyed: boolean }> = [];
  const createWindow = (): HeadlessWindow => {
    const state = { destroyed: false };
    windows.push(state);
    return {
      debugger: fakeDebugger(),
      capture: async () => null,
      loadURL: async () => {
        throw new Error("navigation failed");
      },
      currentUrl: () => "",
      title: () => "Headless",
      destroy: () => {
        state.destroyed = true;
      },
    };
  };
  return { windows, createWindow };
}

describe("HeadlessBrowserHost", () => {
  const allow = (url: string) => url.includes("127.0.0.1");

  it("opens an allowed tab and loads its url in a fresh window", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    const tab = await host.openTab("http://127.0.0.1:5000/");
    expect(tab.url).toBe("http://127.0.0.1:5000/");
    expect(factory.windows).toHaveLength(1);
    expect(factory.windows[0].url).toBe("http://127.0.0.1:5000/");
  });

  it("refuses external urls without creating a window", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await expect(host.openTab("https://evil.com/")).rejects.toBeInstanceOf(NavigationBlockedError);
    expect(factory.windows).toHaveLength(0);
  });

  it("refuses navigation to a non-loopback url", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await host.openTab("http://127.0.0.1:5000/");
    await expect(host.navigate("https://evil.com/")).rejects.toBeInstanceOf(NavigationBlockedError);
  });

  it("refuses reads after the loaded page redirects off loopback", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await host.openTab("http://127.0.0.1:5000/");
    factory.windows[0].url = "https://evil.com/";

    await expect(host.read()).rejects.toBeInstanceOf(NavigationBlockedError);
  });

  it("caps the number of open tabs", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({
      createWindow: factory.createWindow,
      isAllowed: allow,
      maxTabs: 1,
    });
    await host.openTab("http://127.0.0.1:5000/");
    await expect(host.openTab("http://127.0.0.1:5001/")).rejects.toThrow(/Too many tabs/);
  });

  it("tags loopback tabs as creations and blank tabs as web", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    const creation = await host.openTab("http://127.0.0.1:5000/");
    const web = await host.openTab();
    expect(creation.kind).toBe("creation");
    expect(web.kind).toBe("web");
  });

  it("disposes every window when the bot job ends", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await host.openTab("http://127.0.0.1:5000/");
    await host.openTab();
    host.dispose();
    expect(factory.windows.every((w) => w.destroyed)).toBe(true);
    expect(await host.listTabs()).toHaveLength(0);
  });

  it("loads the page before attaching the controller so CDP does not hang", async () => {
    const factory = makeOrderSensitiveFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });

    // Would hang forever with the old attach-before-load order.
    const tab = await host.openTab("http://127.0.0.1:5000/");

    expect(tab.url).toBe("http://127.0.0.1:5000/");
    // The load must come before the first CDP command.
    expect(factory.events[0]).toBe("loadURL:http://127.0.0.1:5000/");
    expect(factory.events).toContain("sendCommand");
    expect(factory.events.indexOf("loadURL:http://127.0.0.1:5000/")).toBeLessThan(
      factory.events.indexOf("sendCommand"),
    );
  });

  it("leaves a blank tab unattached until it navigates to a real page", async () => {
    const factory = makeOrderSensitiveFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });

    // A blank tab must not attach (CDP would hang with nothing committed).
    await host.openTab();
    expect(factory.events).not.toContain("sendCommand");
    // Interacting before navigating is a clear error, not a hang.
    await expect(host.snapshot()).rejects.toThrow(/no page yet/i);

    // Navigating commits a page, so the controller can attach and drive it.
    await host.navigate("http://127.0.0.1:5000/");
    expect(factory.events).toContain("sendCommand");
  });

  it("returns the tab instead of hanging when a page never finishes loading", async () => {
    const factory = makeStuckWindowFactory();
    const host = new HeadlessBrowserHost({
      createWindow: factory.createWindow,
      isAllowed: allow,
      loadTimeoutMs: 50,
    });

    const tab = await host.openTab("http://127.0.0.1:5000/");

    expect(tab.url).toBe("http://127.0.0.1:5000/");
    expect(await host.listTabs()).toHaveLength(1);
  });

  it("returns instead of hanging when navigation to a new url never settles", async () => {
    const factory = makeStuckWindowFactory();
    const host = new HeadlessBrowserHost({
      createWindow: factory.createWindow,
      isAllowed: allow,
      loadTimeoutMs: 50,
    });
    await host.openTab("http://127.0.0.1:5000/");

    await expect(host.navigate("http://127.0.0.1:5001/")).resolves.toBeUndefined();
  });

  it("cleans up a new tab when initial navigation fails", async () => {
    const factory = makeRejectingWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });

    await expect(host.openTab("http://127.0.0.1:5000/")).rejects.toThrow("navigation failed");

    expect(factory.windows).toHaveLength(1);
    expect(factory.windows[0].destroyed).toBe(true);
    expect(await host.listTabs()).toHaveLength(0);
    await expect(host.openTab("http://127.0.0.1:5000/")).rejects.toThrow("navigation failed");
  });
});
