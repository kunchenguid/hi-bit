import { type FormEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../state/configStore";
import { validatePinEntry, validatePinSetup } from "./parent/pinValidation";

export type ParentGateProps = {
  onUnlock: (pin: string) => void;
  onCancel: () => void;
};

export function ParentGate({ onUnlock, onCancel }: ParentGateProps): JSX.Element {
  const status = useConfigStore((s) => s.status);
  const configError = useConfigStore((s) => s.error);
  const load = useConfigStore((s) => s.load);
  const hasParentPin = useConfigStore((s) => s.hasParentPin);
  const setParentPin = useConfigStore((s) => s.setParentPin);
  const verifyParentPin = useConfigStore((s) => s.verifyParentPin);

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [refocusToken, setRefocusToken] = useState(0);

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  useEffect(() => {
    if (refocusToken === 0) return;
    if (busy) return;
    pinInputRef.current?.focus();
  }, [refocusToken, busy]);

  if (status === "idle" || status === "loading") {
    return (
      <main className="hb-gate">
        <p className="hb-gate-loading">Waking parent mode up...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <div className="t-pixel hb-gate-kicker">Parent mode</div>
          <h1>Parent mode is still locked.</h1>
          <p className="hb-gate-sub">{configError ?? "Couldn't read parent PIN settings."}</p>
          <div className="hb-parent-actions">
            <button type="button" className="hb-btn hb-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="hb-btn hb-btn-primary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>): void {
    if (e.key === "Escape" && !busy) {
      e.preventDefault();
      onCancel();
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (hasParentPin) {
      const check = validatePinEntry(pin);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      setBusy(true);
      try {
        const ok = await verifyParentPin(pin);
        if (!ok) {
          setError("That PIN doesn't match. Try again.");
          setPin("");
          setRefocusToken((n) => n + 1);
          return;
        }
        onUnlock(pin);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't verify your PIN.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const check = validatePinSetup(pin, confirm);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      await setParentPin(pin);
      onUnlock(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hb-gate">
      <div className="hb-gate-card">
        <div className="t-pixel hb-gate-kicker">Parent mode</div>
        <h1>{hasParentPin ? "Enter your parent PIN." : "Set a parent PIN."}</h1>
        <p className="hb-gate-sub">
          {hasParentPin
            ? "This gates the audit, progress, and Bit-as-co-teacher views. Kids shouldn't see parent mode."
            : "First time here. Pick a PIN (4+ characters) to gate parent mode on this machine."}
        </p>

        <form className="hb-parent-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <label className="hb-field">
            <span className="hb-field-label t-pixel">PIN</span>
            <input
              ref={pinInputRef}
              className="hb-input"
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error !== null) setError(null);
              }}
              disabled={busy}
              aria-invalid={error !== null}
              // biome-ignore lint/a11y/noAutofocus: primary input on the parent gate
              autoFocus
            />
          </label>

          {!hasParentPin ? (
            <label className="hb-field">
              <span className="hb-field-label t-pixel">Confirm PIN</span>
              <input
                className="hb-input"
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (error !== null) setError(null);
                }}
                disabled={busy}
                aria-invalid={error !== null}
              />
            </label>
          ) : null}

          {error ? <p className="hb-form-err">{error}</p> : null}

          <div className="hb-parent-actions">
            <button
              type="button"
              className="hb-btn hb-btn-ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="hb-btn hb-btn-primary" disabled={busy}>
              {busy
                ? hasParentPin
                  ? "Checking..."
                  : "Saving..."
                : hasParentPin
                  ? "Unlock"
                  : "Set PIN"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
