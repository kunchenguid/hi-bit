import type { PreviewInfo } from "@shared/chat";
import { useEffect, useState } from "react";

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
 * built files load; Open-in-browser hands the URL to the system browser; Close
 * just hides the pane (the server keeps running until Bit stops it).
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
        className="hb-preview-frame"
        title={title}
        src={preview.url}
        sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups allow-modals"
      />
    </div>
  );
}
