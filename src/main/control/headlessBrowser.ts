import { randomUUID } from "node:crypto";
import type { BrowserTab } from "@shared/browser";
import { type BrowserHost, NavigationBlockedError } from "./browserHost";
import { type CapturePng, CdpController, type CdpDebugger } from "./cdpController";

/** One offscreen window the engine can drive, abstracted for testing. */
export interface HeadlessWindow {
  debugger: CdpDebugger;
  capture: CapturePng;
  loadURL(url: string): Promise<void>;
  currentUrl(): string;
  title(): string;
  destroy(): void;
}

export type HeadlessBrowserOptions = {
  createWindow: () => HeadlessWindow;
  /** Loopback gate: only a creation's own preview may load. */
  isAllowed: (url: string) => boolean | Promise<boolean>;
  maxTabs?: number;
  /** Page-load deadline; a stuck preview must never hang a bot's tool call. */
  loadTimeoutMs?: number;
};

/** Matches the visible browser's `waitForLoad` deadline (appControlService). */
const DEFAULT_LOAD_TIMEOUT_MS = 8000;

type HeadlessTab = {
  id: string;
  window: HeadlessWindow;
  controller: CdpController;
  kind: BrowserTab["kind"];
};

/**
 * A bot's browser: every tab is a headless offscreen window, never shown to the
 * kid. Same `BrowserHost` contract as Bit's visible browser, so the `browser_*`
 * tools are identical - only the surface differs. Bots get this and nothing from
 * the `app_*` family. Tear it down when the bot job ends.
 */
export class HeadlessBrowserHost implements BrowserHost {
  private readonly tabs = new Map<string, HeadlessTab>();
  private activeId: string | null = null;
  private readonly createWindow: () => HeadlessWindow;
  private readonly isAllowed: (url: string) => boolean | Promise<boolean>;
  private readonly maxTabs: number;
  private readonly loadTimeoutMs: number;

  constructor(options: HeadlessBrowserOptions) {
    this.createWindow = options.createWindow;
    this.isAllowed = options.isAllowed;
    this.maxTabs = options.maxTabs ?? 4;
    this.loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  }

  private active(): HeadlessTab {
    const tab = this.activeId ? this.tabs.get(this.activeId) : undefined;
    if (!tab) throw new Error("No browser tab is open. Open one with browser_open_tab first.");
    return tab;
  }

  async openTab(url?: string): Promise<BrowserTab> {
    if (this.tabs.size >= this.maxTabs) {
      throw new Error(`Too many tabs open (max ${this.maxTabs}). Close one first.`);
    }
    if (url && !(await this.isAllowed(url))) throw new NavigationBlockedError(url);
    const window = this.createWindow();
    const controller = new CdpController({ debugger: window.debugger, capture: window.capture });
    const id = randomUUID();
    const tab: HeadlessTab = { id, window, controller, kind: kindFor(url) };
    this.tabs.set(id, tab);
    this.activeId = id;
    try {
      // Order matters: a CDP command (`Page.enable` etc.) sent to a webContents
      // that has never navigated never resolves, so `controller.attach()` would
      // hang forever. The page must load - committing a real document - before
      // the controller attaches. A blank tab has nothing to commit, so it stays
      // unattached until its first `navigate()` loads a real page.
      if (url) {
        await this.loadWithDeadline(window, url);
        await this.attachController(tab);
      }
    } catch (error) {
      await this.closeTab(id);
      throw error;
    }
    return this.toTab(tab);
  }

  /**
   * Attaches the controller behind a deadline. Once a page has committed this is
   * near-instant; the deadline only guards the pathological case where the
   * document never commits (a server that accepts but never responds), which
   * would otherwise leave the enable commands - and the bot's tool call - hung.
   */
  private async attachController(tab: HeadlessTab): Promise<void> {
    if (tab.controller.isAttached()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error("The page never finished loading, so the browser could not attach.")),
        this.loadTimeoutMs,
      );
    });
    try {
      await Promise.race([tab.controller.attach(), deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Loads a url but resolves once the page-load deadline passes even if the page
   * never reports done - a creation preview that stalls mid-load (a subresource
   * that never finishes, a server that streams forever) would otherwise leave
   * Electron's `loadURL` promise pending and hang the bot's tool call forever.
   * A genuine load failure still rejects (so the caller can clean up the tab);
   * only an unbounded wait is converted into "return the tab anyway".
   */
  private async loadWithDeadline(window: HeadlessWindow, url: string): Promise<void> {
    const load = window.loadURL(url);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.loadTimeoutMs);
    });
    try {
      await Promise.race([load, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    // If the deadline won, the load promise is still pending; swallow any later
    // rejection (e.g. Electron's ERR_ABORTED) so it can't surface as unhandled.
    void load.catch(() => {});
  }

  async closeTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.controller.detach();
    tab.window.destroy();
    this.tabs.delete(tabId);
    if (this.activeId === tabId) this.activeId = this.tabs.keys().next().value ?? null;
  }

  async listTabs(): Promise<BrowserTab[]> {
    return [...this.tabs.values()].map((tab) => this.toTab(tab));
  }

  async switchTab(tabId: string): Promise<void> {
    if (!this.tabs.has(tabId)) throw new Error(`No tab ${tabId}.`);
    this.activeId = tabId;
  }

  async navigate(url: string): Promise<void> {
    if (!(await this.isAllowed(url))) throw new NavigationBlockedError(url);
    const tab = this.active();
    tab.kind = kindFor(url);
    await this.loadWithDeadline(tab.window, url);
    // A blank tab opened without a url is still unattached; now that it has
    // committed a real page, the controller can attach (see openTab).
    await this.attachController(tab);
  }

  async back(): Promise<void> {
    await this.assertActiveAllowed();
    await this.active().controller.back();
  }

  async reload(): Promise<void> {
    await this.assertActiveAllowed();
    await this.active().controller.reload();
  }

  async snapshot(): Promise<string> {
    await this.assertActiveAllowed();
    return this.active().controller.snapshot("all");
  }

  async click(ref: string): Promise<void> {
    await this.assertActiveAllowed();
    return this.active().controller.click(ref);
  }

  async fill(ref: string, text: string): Promise<void> {
    await this.assertActiveAllowed();
    return this.active().controller.fill(ref, text);
  }

  async type(text: string): Promise<void> {
    await this.assertActiveAllowed();
    return this.active().controller.type(text);
  }

  async press(key: string): Promise<void> {
    await this.assertActiveAllowed();
    return this.active().controller.press(key);
  }

  async scroll(direction: "up" | "down"): Promise<void> {
    await this.assertActiveAllowed();
    return this.active().controller.scroll(direction);
  }

  async read(): Promise<string> {
    await this.assertActiveAllowed();
    return this.active().controller.readText();
  }

  async screenshot(): Promise<string | null> {
    await this.assertActiveAllowed();
    return this.active().controller.screenshot();
  }

  async console(): Promise<string[]> {
    await this.assertActiveAllowed();
    return this.active().controller.recentConsole();
  }

  private async assertActiveAllowed(): Promise<void> {
    const tab = this.active();
    // A blank tab stays unattached (see openTab); driving CDP at it would hang.
    if (!tab.controller.isAttached()) {
      throw new Error("This tab has no page yet. Navigate to a creation's preview first.");
    }
    const current = tab.window.currentUrl();
    if (current && !(await this.isAllowed(current))) throw new NavigationBlockedError(current);
    const frameUrl = await tab.controller.firstDisallowedFrameUrl((url) => this.isAllowed(url));
    if (frameUrl) throw new NavigationBlockedError(frameUrl);
  }

  /** Tears down every headless window. Call when the bot job ends. */
  dispose(): void {
    for (const tab of this.tabs.values()) {
      tab.controller.detach();
      tab.window.destroy();
    }
    this.tabs.clear();
    this.activeId = null;
  }

  private toTab(tab: HeadlessTab): BrowserTab {
    return {
      id: tab.id,
      url: tab.window.currentUrl(),
      title: tab.window.title(),
      kind: tab.kind,
    };
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
