import type { AuthStatus } from "@shared/auth";

type AuthGateProps = {
  status: AuthStatus | null;
  busy: boolean;
  error: string | null;
  onLogin: () => void;
};

export function AuthGate({ status, busy, error, onLogin }: AuthGateProps) {
  return (
    <main className="hb-shell hb-auth-shell">
      <section className="hb-card hb-auth-card">
        <div className="hb-bit-badge">Bit</div>
        <p className="t-pixel">Local coding buddy</p>
        <h1>Sign in to Codex</h1>
        <p>
          Hi-Bit uses your Codex subscription to run Bit, the coding partner that edits files in
          each local project folder.
        </p>
        <p className="t-small">
          Hi-Bit stores your token locally under{" "}
          <code>{status?.storage.path ?? ".hi-bit/auth"}</code>.
          {status?.storage.encrypted
            ? " Secure storage is on."
            : " Secure storage is not available on this computer."}
        </p>
        {status?.storage.warning ? <p className="hb-warning">{status.storage.warning}</p> : null}
        {error || status?.error ? <p className="hb-error">{error ?? status?.error}</p> : null}
        <button
          className="hb-button hb-button-primary"
          type="button"
          onClick={onLogin}
          disabled={busy}
        >
          {busy ? "Waiting for sign-in" : "Sign in with Codex"}
        </button>
      </section>
    </main>
  );
}
