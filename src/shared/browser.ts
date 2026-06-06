/**
 * Shared shapes for Bit's (and bots') in-app browser. A "tab" the kid can see is
 * a sandboxed iframe in the renderer's BrowserPane; a bot's tab is a headless
 * offscreen window the kid never sees. The renderer only ever deals with visible
 * tabs.
 */

/** Why a tab exists, so the UI can label a creation differently from a website. */
export type BrowserTabKind = "creation" | "web";

export type BrowserTab = {
  id: string;
  url: string;
  title?: string;
  kind: BrowserTabKind;
};

/** The renderer's full browser state, mirrored to main and persisted per profile. */
export type BrowserState = {
  tabs: BrowserTab[];
  activeTabId: string | null;
};

/** A rectangle in renderer-viewport CSS pixels, for the tutorial spotlight. */
export type SpotlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional kid-facing label drawn near the highlight. */
  label?: string;
};
