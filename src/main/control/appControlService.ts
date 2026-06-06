import { randomUUID } from "node:crypto";
import type { BrowserState, BrowserTab, SpotlightRect } from "@shared/browser";
import type { AppSurface } from "../pi/appTools";
import { type BrowserHost, NavigationBlockedError } from "./browserHost";
import { CdpController } from "./cdpController";
import { HeadlessBrowserHost, type HeadlessWindow } from "./headlessBrowser";
import { isNavigationAllowed } from "./navigation";

/** Renderer-facing channels this service broadcasts on. */
export const BROWSER_STATE_CHANNEL = "hibit:browser:state";
export const SPOTLIGHT_CHANNEL = "hibit:browser:spotlight";

export type AppControlDeps = {
  /** The main window webContents' CDP debugger, or null when there's no window. */
  getAppDebugger: () => AppDebugger | null;
  /** The main window webContents id, to notice a reload/new window. */
  getAppWebContentsId: () => number | null;
  /** Whole-window screenshot as base64 PNG (downscaled). Backs app_screenshot. */
  captureApp: () => Promise<string | null>;
  /** Send a payload to every renderer (browser state, spotlight rects). */
  broadcast: (channel: string, payload: unknown) => void;
  /** Make a fresh headless offscreen window for a bot tab. */
  createHeadlessWindow: () => HeadlessWindow;
};

/** Electron's debugger shape, re-exported so deps don't import the controller. */
export type AppDebugger = ConstructorParameters<typeof CdpController>[0]["debugger"];

/**
 * The control plane for Bit's app-spotlight tools and Bit's visible browser, plus
 * a factory for bots' headless browsers. One CDP controller is attached lazily to
 * the live app webContents (re-attached if the window reloads). The browser tab
 * model is owned here and mirrored to the renderer, which renders one sandboxed
 * iframe per tab.
 */
export class AppControlService {
  private controller: CdpController | null = null;
  private controllerWcId: number | null = null;

  private tabs: BrowserTab[] = [];
  private activeTabId: string | null = null;
  private readonly pendingLoads = new Map<string, () => void>();

  constructor(private readonly deps: AppControlDeps) {}

  // --- navigation gate -----------------------------------------------------

  /** Only a creation's own loopback preview may load; external sites are refused. */
  private isAllowed(url: string): boolean {
    return isNavigationAllowed(url);
  }

  // --- the lazily-attached app controller ----------------------------------

  private async controllerFor(): Promise<CdpController> {
    const wcId = this.deps.getAppWebContentsId();
    if (wcId === null) throw new Error("There's no app window to control right now.");
    if (this.controller && this.controllerWcId === wcId && this.controller.isAttached()) {
      return this.controller;
    }
    const dbg = this.deps.getAppDebugger();
    if (!dbg) throw new Error("There's no app window to control right now.");
    this.controller = new CdpController({ debugger: dbg, capture: this.deps.captureApp });
    this.controllerWcId = wcId;
    await this.controller.attach();
    return this.controller;
  }

  // --- AppSurface (Bit's app_* tools) --------------------------------------

  /** The surface Bit's `app_*` tools drive: observe + spotlight, never click. */
  readonly appSurface: AppSurface = {
    screenshot: () => this.deps.captureApp(),
    snapshotChrome: async () => {
      const controller = await this.controllerFor();
      return controller.snapshot("top");
    },
    highlight: async (ref, label) => {
      try {
        const controller = await this.controllerFor();
        const rect = await controller.resolveRect(ref);
        const spotlight: SpotlightRect = { ...rect, label };
        this.deps.broadcast(SPOTLIGHT_CHANNEL, spotlight);
        return true;
      } catch {
        return false;
      }
    },
    clearHighlight: async () => {
      this.deps.broadcast(SPOTLIGHT_CHANNEL, null);
    },
  };

  // --- the visible browser (Bit's browser_* tools) -------------------------

  /** Bit's browser: tabs are sandboxed iframes the kid sees in the BrowserPane. */
  readonly browserHost: BrowserHost = {
    openTab: (url) => this.openTab(url),
    closeTab: (tabId) => this.closeTab(tabId),
    listTabs: async () => [...this.tabs],
    switchTab: (tabId) => this.switchTab(tabId),
    navigate: (url) => this.navigateActive(url),
    back: async () => {
      await this.assertBrowserAllowed();
      const frameKey = await this.activeFrameKey();
      if (frameKey) await (await this.controllerFor()).back(frameKey);
    },
    reload: () => this.reloadActive(),
    snapshot: async () => {
      await this.assertBrowserAllowed();
      const frameKey = await this.activeFrameKey();
      return frameKey ? (await this.controllerFor()).snapshotFrame(frameKey) : "";
    },
    click: async (ref) => (await this.browserController()).click(ref),
    fill: async (ref, text) => (await this.browserController()).fill(ref, text),
    type: async (text) => (await this.browserController()).type(text),
    press: async (key) => (await this.browserController()).press(key),
    scroll: async (direction) => (await this.browserController()).scroll(direction),
    read: async () => {
      await this.assertBrowserAllowed();
      const frameKey = await this.activeFrameKey();
      return frameKey ? (await this.controllerFor()).readText(frameKey) : "";
    },
    screenshot: async () => {
      await this.assertBrowserAllowed();
      const frameKey = await this.activeFrameKey();
      return frameKey ? (await this.controllerFor()).screenshotFrame(frameKey) : null;
    },
    console: async () => {
      await this.assertBrowserAllowed();
      return (await this.controllerFor()).recentConsole();
    },
  };

  private activeTab(): BrowserTab | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  private async activeFrameKey(): Promise<string | undefined> {
    const tab = this.activeTab();
    if (!tab?.url) return undefined;
    return (await this.controllerFor()).findFrameKeyByUrl(tab.url);
  }

  private broadcastState(): void {
    this.deps.broadcast(BROWSER_STATE_CHANNEL, this.state());
  }

  state(): BrowserState {
    return { tabs: [...this.tabs], activeTabId: this.activeTabId };
  }

  /** Restore persisted tabs, dropping any non-creation URL no longer allowed. */
  async restore(state: BrowserState): Promise<void> {
    this.tabs = state.tabs.filter((t) => !t.url || this.isAllowed(t.url));
    this.activeTabId = this.tabs.some((t) => t.id === state.activeTabId)
      ? state.activeTabId
      : (this.tabs[0]?.id ?? null);
    this.broadcastState();
  }

  private async openTab(url?: string): Promise<BrowserTab> {
    if (url) {
      if (!this.isAllowed(url)) throw new NavigationBlockedError(url);
      const existing = this.tabs.find((t) => t.url === url);
      if (existing) {
        this.activeTabId = existing.id;
        this.broadcastState();
        return existing;
      }
    }
    const tab: BrowserTab = { id: randomUUID(), url: url ?? "", kind: kindFor(url) };
    this.tabs = [...this.tabs, tab];
    this.activeTabId = tab.id;
    this.broadcastState();
    if (url) await this.waitForLoad(tab.id, url);
    return tab;
  }

  /** Opens or focuses a creation's tab (Play). */
  async playInTab(url: string, title: string, projectId?: string): Promise<BrowserState> {
    const existing = this.tabs.find((t) => t.url === url);
    if (existing) {
      this.activeTabId = existing.id;
      existing.projectId = projectId ?? existing.projectId;
    } else {
      const tab: BrowserTab = { id: randomUUID(), url, title, kind: "creation", projectId };
      this.tabs = [...this.tabs, tab];
      this.activeTabId = tab.id;
    }
    this.broadcastState();
    return this.state();
  }

  private async closeTab(tabId: string): Promise<void> {
    this.tabs = this.tabs.filter((t) => t.id !== tabId);
    if (this.activeTabId === tabId) this.activeTabId = this.tabs[this.tabs.length - 1]?.id ?? null;
    this.broadcastState();
  }

  private async switchTab(tabId: string): Promise<void> {
    if (!this.tabs.some((t) => t.id === tabId)) throw new Error(`No tab ${tabId}.`);
    this.activeTabId = tabId;
    this.broadcastState();
  }

  private async navigateActive(url: string): Promise<void> {
    if (!this.isAllowed(url)) throw new NavigationBlockedError(url);
    const tab = this.activeTab();
    if (!tab) throw new Error("No tab is open. Open one with browser_open_tab first.");
    tab.url = url;
    tab.kind = kindFor(url);
    this.broadcastState();
    await this.waitForLoad(tab.id, url);
  }

  private async reloadActive(): Promise<void> {
    await this.assertBrowserAllowed();
    const frameKey = await this.activeFrameKey();
    if (frameKey) await (await this.controllerFor()).reload(frameKey);
  }

  private async browserController(): Promise<CdpController> {
    await this.assertBrowserAllowed();
    return this.controllerFor();
  }

  private async assertBrowserAllowed(): Promise<void> {
    const frameKey = await this.activeFrameKey();
    const controller = await this.controllerFor();
    if (!frameKey) {
      const activeUrl = this.activeTab()?.url;
      const disallowed = (await controller.childFrameUrls()).find(
        (frame) => !this.isAllowed(frame.url),
      );
      if (disallowed) throw new NavigationBlockedError(disallowed.url);
      if (activeUrl) throw new NavigationBlockedError(activeUrl);
      return;
    }
    const disallowed = await controller.firstDisallowedFrameUrl(
      (url) => this.isAllowed(url),
      frameKey,
    );
    if (disallowed) throw new NavigationBlockedError(disallowed);
  }

  /**
   * Resolves when the renderer reports the tab loaded (or the controller sees the
   * frame), with a timeout so a slow/stuck page can't hang a tool call forever.
   */
  private waitForLoad(tabId: string, url: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.pendingLoads.delete(tabId);
        resolve();
      };
      this.pendingLoads.set(tabId, done);
      // Fallback: poll the controller for the frame to appear.
      const deadline = Date.now() + 8000;
      const poll = async () => {
        if (settled) return;
        try {
          const controller = await this.controllerFor();
          if (await controller.findFrameKeyByUrl(url)) return done();
        } catch {
          // No window yet; keep waiting until the deadline.
        }
        if (Date.now() > deadline) return done();
        setTimeout(poll, 200);
      };
      void poll();
    });
  }

  /** Called from IPC when the renderer finishes loading a tab's iframe. */
  async onTabLoaded(tabId: string, url: string, title?: string): Promise<void> {
    const tab = this.tabs.find((t) => t.id === tabId);
    let loadedUrl = url;
    try {
      const controller = await this.controllerFor();
      const frameKey = await controller.findFrameKeyByUrl(url);
      if (frameKey) {
        loadedUrl = await controller.currentUrl(frameKey);
      } else if (tabId === this.activeTabId) {
        const candidates = await controller.childFrameUrls();
        const allowed = candidates.find((candidate) => this.isAllowed(candidate.url));
        if (allowed) loadedUrl = allowed.url;
      }
    } catch {
      // The app window may not be attachable during startup or shutdown.
    }
    if (tab) {
      if (loadedUrl) tab.url = loadedUrl;
      if (title) tab.title = title;
    }
    this.pendingLoads.get(tabId)?.();
  }

  // --- bots' headless browsers --------------------------------------------

  /** A fresh headless browser for a bot job. Caller disposes it when done. */
  createHeadlessBrowser(): HeadlessBrowserHost {
    return new HeadlessBrowserHost({
      createWindow: this.deps.createHeadlessWindow,
      isAllowed: (url) => this.isAllowed(url),
    });
  }
}

function kindFor(url?: string): BrowserTab["kind"] {
  if (!url) return "web";
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" ? "creation" : "web";
  } catch {
    return "web";
  }
}
