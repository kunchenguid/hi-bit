import type { BrowserTab } from "@shared/browser";

/**
 * The surface the `browser_*` tools drive, independent of where the tabs live.
 * `VisibleBrowserHost` backs it with renderer iframes (Bit); `HeadlessBrowserHost`
 * backs it with offscreen windows (bots). Tools never know which.
 *
 * Navigation passes through the host's allowlist gate before any load - the tools
 * just surface the refusal.
 */
export interface BrowserHost {
  openTab(url?: string): Promise<BrowserTab>;
  closeTab(tabId: string): Promise<void>;
  listTabs(): Promise<BrowserTab[]>;
  switchTab(tabId: string): Promise<void>;

  /** Navigate the active tab. Throws `NavigationBlockedError` for refused URLs. */
  navigate(url: string): Promise<void>;
  back(): Promise<void>;
  reload(): Promise<void>;

  /** Accessibility snapshot of the active tab's page, with refs. */
  snapshot(): Promise<string>;
  click(ref: string): Promise<void>;
  fill(ref: string, text: string): Promise<void>;
  type(text: string): Promise<void>;
  press(key: string): Promise<void>;
  scroll(direction: "up" | "down"): Promise<void>;

  /** The active tab's readable text content. */
  read(): Promise<string>;
  /** Base64 PNG of the active tab. */
  screenshot(): Promise<string | null>;
  /** Recent console/log lines from the active tab. */
  console(): Promise<string[]>;
}

/** Thrown when a navigation target is neither loopback nor parent-approved. */
export class NavigationBlockedError extends Error {
  constructor(url: string) {
    super(`I can only open this creation's own preview or a grown-up-approved website: ${url}.`);
    this.name = "NavigationBlockedError";
  }
}
