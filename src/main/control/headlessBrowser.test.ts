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
  const allow = (url: string) => url.includes("127.0.0.1") || url.includes("wikipedia.org");

  it("opens an allowed tab and loads its url in a fresh window", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    const tab = await host.openTab("https://wikipedia.org/");
    expect(tab.url).toBe("https://wikipedia.org/");
    expect(factory.windows).toHaveLength(1);
    expect(factory.windows[0].url).toBe("https://wikipedia.org/");
  });

  it("refuses an off-allowlist url without creating a window", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await expect(host.openTab("https://evil.com/")).rejects.toBeInstanceOf(NavigationBlockedError);
    expect(factory.windows).toHaveLength(0);
  });

  it("refuses navigation to an off-allowlist url", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await host.openTab("https://wikipedia.org/");
    await expect(host.navigate("https://evil.com/")).rejects.toBeInstanceOf(NavigationBlockedError);
  });

  it("refuses reads after the loaded page redirects off the allowlist", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await host.openTab("https://wikipedia.org/");
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

  it("tags loopback tabs as creations and external tabs as web", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    const creation = await host.openTab("http://127.0.0.1:5000/");
    const web = await host.openTab("https://wikipedia.org/");
    expect(creation.kind).toBe("creation");
    expect(web.kind).toBe("web");
  });

  it("disposes every window when the bot job ends", async () => {
    const factory = makeWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });
    await host.openTab("http://127.0.0.1:5000/");
    await host.openTab("https://wikipedia.org/");
    host.dispose();
    expect(factory.windows.every((w) => w.destroyed)).toBe(true);
    expect(await host.listTabs()).toHaveLength(0);
  });

  it("cleans up a new tab when initial navigation fails", async () => {
    const factory = makeRejectingWindowFactory();
    const host = new HeadlessBrowserHost({ createWindow: factory.createWindow, isAllowed: allow });

    await expect(host.openTab("https://wikipedia.org/")).rejects.toThrow("navigation failed");

    expect(factory.windows).toHaveLength(1);
    expect(factory.windows[0].destroyed).toBe(true);
    expect(await host.listTabs()).toHaveLength(0);
    await expect(host.openTab("https://wikipedia.org/")).rejects.toThrow("navigation failed");
  });
});
