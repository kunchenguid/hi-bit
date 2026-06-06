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
  /** Allowlist gate (loopback already allowed by the caller's implementation). */
  isAllowed: (url: string) => boolean;
  maxTabs?: number;
};

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
  private readonly isAllowed: (url: string) => boolean;
  private readonly maxTabs: number;

  constructor(options: HeadlessBrowserOptions) {
    this.createWindow = options.createWindow;
    this.isAllowed = options.isAllowed;
    this.maxTabs = options.maxTabs ?? 4;
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
    if (url && !this.isAllowed(url)) throw new NavigationBlockedError(url);
    const window = this.createWindow();
    const controller = new CdpController({ debugger: window.debugger, capture: window.capture });
    await controller.attach();
    const id = randomUUID();
    const tab: HeadlessTab = { id, window, controller, kind: kindFor(url) };
    this.tabs.set(id, tab);
    this.activeId = id;
    if (url) await window.loadURL(url);
    return this.toTab(tab);
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
    if (!this.isAllowed(url)) throw new NavigationBlockedError(url);
    const tab = this.active();
    tab.kind = kindFor(url);
    await tab.window.loadURL(url);
  }

  async back(): Promise<void> {
    await this.active().controller.back();
  }

  async reload(): Promise<void> {
    await this.active().controller.reload();
  }

  snapshot(): Promise<string> {
    return this.active().controller.snapshot("all");
  }

  click(ref: string): Promise<void> {
    return this.active().controller.click(ref);
  }

  fill(ref: string, text: string): Promise<void> {
    return this.active().controller.fill(ref, text);
  }

  type(text: string): Promise<void> {
    return this.active().controller.type(text);
  }

  press(key: string): Promise<void> {
    return this.active().controller.press(key);
  }

  scroll(direction: "up" | "down"): Promise<void> {
    return this.active().controller.scroll(direction);
  }

  read(): Promise<string> {
    return this.active().controller.readText();
  }

  screenshot(): Promise<string | null> {
    return this.active().controller.screenshot();
  }

  async console(): Promise<string[]> {
    return this.active().controller.recentConsole();
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
