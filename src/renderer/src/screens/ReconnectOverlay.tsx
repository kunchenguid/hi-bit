import type { AuthStatus } from "@shared/auth";
import { useEffect, useRef } from "react";

type ReconnectOverlayProps = {
  status: AuthStatus | null;
  busy: boolean;
  error: string | null;
  onReconnect: () => void;
};

/**
 * A blocking overlay shown when the Codex token dies mid-session. It sits on top
 * of the live chat (which stays mounted, so draft, transcript, and any open
 * preview survive) and only clears once Codex is reconnected. There is no
 * dismiss: the chat cannot work without a token, so reconnecting is the one way
 * forward.
 */
export function ReconnectOverlay({ status, busy, error, onReconnect }: ReconnectOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reconnectButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (busy) {
      dialogRef.current?.focus();
      return;
    }
    reconnectButtonRef.current?.focus();
  }, [busy]);

  return (
    <div
      ref={dialogRef}
      className="hb-reconnect-backdrop"
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          if (busy) {
            dialogRef.current?.focus();
            return;
          }
          reconnectButtonRef.current?.focus();
        }
      }}
    >
      <section className="hb-card hb-auth-card hb-reconnect-card">
        <div className="hb-bit-badge">Bit</div>
        <p className="t-pixel">Codex disconnected</p>
        <h1>Reconnect Codex</h1>
        <p>
          Bit lost its connection to Codex, so it can't build right now. Reconnect to pick up
          exactly where you left off - your chat is still here.
        </p>
        <p className="t-small">
          This happens when the saved Codex sign-in expires. Reconnecting refreshes it on this
          computer.
        </p>
        {error || status?.error ? <p className="hb-error">{error ?? status?.error}</p> : null}
        <button
          ref={reconnectButtonRef}
          className="hb-button hb-button-primary"
          type="button"
          onClick={onReconnect}
          disabled={busy}
        >
          {busy ? "Waiting for Codex" : "Reconnect Codex"}
        </button>
      </section>
    </div>
  );
}
