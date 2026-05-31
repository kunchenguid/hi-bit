import type { PreviewInfo } from "@shared/chat";
import { useEffect, useRef, useState } from "react";

type PreviewPaneProps = {
  preview: PreviewInfo;
  /** Bumped by the parent to force a reload (e.g. after a rebuild finishes). */
  reloadSignal?: number;
  onOpenExternal: (url: string) => void;
  onClose: () => void;
};

/**
 * The split-pane that plays a creation's live preview. Points a sandboxed iframe
 * at the creation's own loopback server. Reload remounts the frame so freshly
 * built files load; each load focuses the frame so game controls work without
 * an extra click; Open-in-browser hands the URL to the system browser; Close just
 * hides the pane (the server keeps running until Bit stops it).
 *
 * The sandbox includes `allow-same-origin` so creations behave like real web
 * pages - they can use localStorage, IndexedDB, and cookies (high scores, saves,
 * settings are everywhere in kid games). Without it those APIs throw a
 * SecurityError that silently aborts the creation's script. It stays safe because
 * the iframe loads a loopback origin (127.0.0.1:PORT) that always differs from the
 * app's own origin, so same-origin-policy still blocks the frame from reaching the
 * parent to escape its sandbox.
 */
export function PreviewPane({
  preview,
  reloadSignal = 0,
  onOpenExternal,
  onClose,
}: PreviewPaneProps) {
  // Remounting the iframe (new key) is the most reliable cross-server reload.
  const [reloadCount, setReloadCount] = useState(0);
  useEffect(() => {
    if (reloadSignal > 0) setReloadCount((count) => count + 1);
  }, [reloadSignal]);

  const frameRef = useRef<HTMLIFrameElement>(null);

  const title = preview.title ?? "Your creation";
  return (
    <div className="hb-preview-pane">
      <div className="hb-preview-bar">
        <span className="hb-preview-badge" aria-hidden="true">
          ▶
        </span>
        <span className="hb-preview-title" title={title}>
          {title}
        </span>
        <button
          type="button"
          className="hb-preview-action"
          onClick={() => setReloadCount((count) => count + 1)}
        >
          ↻ Reload
        </button>
        <button
          type="button"
          className="hb-preview-action"
          onClick={() => onOpenExternal(preview.url)}
        >
          ⤢ Open in browser
        </button>
        <button
          type="button"
          className="hb-preview-action hb-preview-close"
          aria-label="Close preview"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <iframe
        key={reloadCount}
        ref={frameRef}
        className="hb-preview-frame"
        title={title}
        src={preview.url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals"
        // Move keyboard focus into the creation as soon as it loads so game
        // controls (arrows, space, WASD) work without the kid first clicking the
        // page. Refires on every remount, so Reload/rebuild refocus too.
        onLoad={() => frameRef.current?.focus()}
      />
    </div>
  );
}
