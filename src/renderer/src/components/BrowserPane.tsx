import type { BrowserState } from "@shared/browser";
import { useEffect, useRef, useState } from "react";

type BrowserPaneProps = {
  state: BrowserState;
  /** Bumped by the parent to reload the active tab (e.g. after a rebuild). */
  reloadSignal?: number;
  reloadProjectId?: string | null;
  /** Empties the HTTP cache before a creation tab remounts, so rebuilds show. */
  clearCache?: () => Promise<void>;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReportLoaded: (tabId: string, url: string, title?: string) => void;
  onOpenExternal: (url: string) => void;
};

/** A loopback URL (a creation preview) - safe to open in the system browser. */
function isLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch {
    return false;
  }
}

function tabLabel(title: string | undefined, url: string): string {
  if (title?.trim()) return title;
  if (!url) return "New tab";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * The in-app browser surface: a tab strip plus one sandboxed iframe per tab
 * (only the active one shown, so switching preserves each page's state). Tab
 * state is owned in main and arrives via `state`; the kid can switch and close
 * tabs, Bit opens and steers them. Every tab is a creation's own loopback
 * preview - external websites are never loaded. Reload empties the HTTP cache
 * then remounts the active tab so a rebuilt creation shows its new files (same
 * fix as the old PreviewPane). Each load is reported back so a tool's navigate
 * can resolve, and the active frame is focused so game controls work without a
 * click.
 *
 * The sandbox keeps `allow-same-origin` so a creation behaves like a real page
 * (localStorage, cookies). It stays safe because each tab loads a loopback
 * origin that always differs from the app's own origin, so same-origin policy
 * still blocks a frame from reaching the parent to escape.
 */
export function BrowserPane({
  state,
  reloadSignal = 0,
  reloadProjectId = null,
  clearCache,
  onSwitchTab,
  onCloseTab,
  onReportLoaded,
  onOpenExternal,
}: BrowserPaneProps) {
  const { tabs, activeTabId } = state;
  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const frameRefs = useRef(new Map<string, HTMLIFrameElement>());
  // Per-tab remount counter so reloading one tab refetches without disturbing others.
  const [reloadCounts, setReloadCounts] = useState<Record<string, number>>({});

  const reloadTab = (tabId: string) => {
    const remount = () =>
      setReloadCounts((counts) => ({ ...counts, [tabId]: (counts[tabId] ?? 0) + 1 }));
    if (!clearCache) {
      remount();
      return;
    }
    void clearCache().then(remount, remount);
  };

  const reloadActive = () => {
    if (!active) return;
    reloadTab(active.id);
  };

  // Parent-driven reload (a rebuild finished). A ref keeps the latest active id
  // out of the effect deps so a new tab can't trigger a spurious reload.
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => {
    const target = reloadProjectId
      ? tabs.find((tab) => tab.kind === "creation" && tab.projectId === reloadProjectId)
      : active;
    if (target) reloadTab(target.id);
  };
  useEffect(() => {
    if (reloadSignal > 0) reloadRef.current();
  }, [reloadSignal]);

  // Focus the active tab's frame when it becomes active, for keyboard controls.
  useEffect(() => {
    if (activeTabId) frameRefs.current.get(activeTabId)?.focus();
  }, [activeTabId]);

  return (
    <div className="hb-preview-pane hb-browser-pane">
      {/* One toolbar: tabs carry the title (left), actions are icons (right). */}
      <div className="hb-browser-toolbar">
        <div className="hb-browser-tabs" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`hb-browser-tab${tab.id === activeTabId ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="hb-browser-tab-label"
                role="tab"
                aria-selected={tab.id === activeTabId}
                onClick={() => onSwitchTab(tab.id)}
                title={tab.url}
              >
                {"▶ "}
                {tabLabel(tab.title, tab.url)}
              </button>
              <button
                type="button"
                className="hb-browser-tab-close"
                aria-label={`Close ${tabLabel(tab.title, tab.url)}`}
                onClick={() => onCloseTab(tab.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="hb-browser-actions">
          <button
            type="button"
            className="hb-preview-action hb-browser-action"
            aria-label="Reload"
            title="Reload"
            onClick={reloadActive}
            disabled={!active}
          >
            ↻
          </button>
          {active && isLoopback(active.url) ? (
            <button
              type="button"
              className="hb-preview-action hb-browser-action"
              aria-label="Open in browser"
              title="Open in browser"
              onClick={() => onOpenExternal(active.url)}
            >
              ⤢
            </button>
          ) : null}
        </div>
      </div>
      <div className="hb-browser-frames">
        {tabs.map((tab) => (
          <iframe
            key={`${tab.id}-${reloadCounts[tab.id] ?? 0}`}
            ref={(el) => {
              if (el) frameRefs.current.set(tab.id, el);
              else frameRefs.current.delete(tab.id);
            }}
            className="hb-preview-frame hb-browser-frame"
            title={tabLabel(tab.title, tab.url)}
            src={tab.url || "about:blank"}
            hidden={tab.id !== activeTabId}
            sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-modals"
            onLoad={() => {
              onReportLoaded(tab.id, tab.url, tab.title);
              if (tab.id === activeTabId) frameRefs.current.get(tab.id)?.focus();
            }}
          />
        ))}
      </div>
    </div>
  );
}
