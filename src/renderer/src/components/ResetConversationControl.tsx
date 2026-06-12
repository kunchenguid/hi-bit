import { useState } from "react";

type ResetConversationControlProps = {
  builderName: string;
  busy: boolean;
  blockedReason?: string | null;
  onReset: () => Promise<void>;
};

export function ResetConversationControl({
  builderName,
  busy,
  blockedReason,
  onReset,
}: ResetConversationControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = Boolean(blockedReason);
  const disabled = busy || blocked;

  async function confirmReset(): Promise<void> {
    setError(null);
    try {
      await onReset();
      setConfirming(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <section className="hb-reset-conversation" aria-label="Reset conversation">
      {confirming ? (
        <fieldset className="hb-reset-confirm">
          <legend id="reset-conversation-title">Reset Bit's conversation?</legend>
          <p>This cannot be undone. It clears {builderName}'s chat history and starts Bit fresh.</p>
          <p className="hb-reset-kept">
            Kept: creations, saved game progress, pictures, and learning progress.
          </p>
          {blockedReason ? <p className="hb-warning">{blockedReason}</p> : null}
          {error ? <p className="hb-error">{error}</p> : null}
          <div className="hb-reset-actions">
            <button
              className="hb-button hb-button-secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setConfirming(false);
              }}
            >
              Cancel
            </button>
            <button
              className="hb-button hb-button-danger"
              type="button"
              disabled={disabled}
              onClick={() => void confirmReset()}
            >
              Yes, reset conversation
            </button>
          </div>
        </fieldset>
      ) : (
        <>
          <button
            className="hb-button hb-button-secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Reset conversation
          </button>
          {blockedReason ? <p className="hb-warning">{blockedReason}</p> : null}
        </>
      )}
    </section>
  );
}
