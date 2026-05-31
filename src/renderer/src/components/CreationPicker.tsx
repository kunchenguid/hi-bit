import mascotBit from "@design/assets/mascot-boo.svg";
import type { ProjectSummary } from "@shared/project";
import { type KeyboardEvent, useEffect, useRef } from "react";

type CreationPickerProps = {
  creations: ProjectSummary[];
  /** Creations with a live or restartable preview, shown as ready to play. */
  playableProjectIds: Set<string>;
  onPlay: (projectId: string) => void;
  onClose: () => void;
};

/**
 * The picker that stands in for Play once the kid has more than one creation.
 * Lists every creation newest first. Creations with no preview yet still appear
 * because this is the kid's whole shelf, but only playable creations can start.
 */
export function CreationPicker({
  creations,
  playableProjectIds,
  onPlay,
  onClose,
}: CreationPickerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
  }, []);

  const close = () => {
    const returnFocus = returnFocusRef.current;
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    onClose();
  };

  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Newest first, so the thing the kid just built sits at the top.
  const ordered = [...creations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="hb-creation-picker-backdrop">
      <section
        className="hb-card hb-creation-picker"
        aria-label="Your creations"
        aria-modal="true"
        onKeyDown={keepFocusInside}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="hb-creation-picker-head">
          <span className="hb-bit-badge" aria-hidden="true">
            <img
              className="hb-bit-badge-mascot pixel-art"
              src={mascotBit}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div className="hb-creation-picker-title">
            <h2>Your creations</h2>
            <p className="t-small">Tap one to play it.</p>
          </div>
          <button type="button" className="hb-button hb-button-secondary" onClick={close}>
            Close
          </button>
        </header>

        <div className="hb-creation-picker-list">
          {ordered.map((creation) => {
            const playable = playableProjectIds.has(creation.id);
            return (
              <button
                type="button"
                className="hb-creation-pick"
                disabled={!playable}
                key={creation.id}
                onClick={() => {
                  if (!playable) return;
                  onPlay(creation.id);
                  close();
                }}
              >
                <span className="hb-creation-chiplet" aria-hidden="true">
                  {creation.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="hb-creation-meta">
                  <strong>{creation.title}</strong>
                  <span>{playable ? "Ready to play" : "No preview yet"}</span>
                </span>
                <span className="hb-creation-pick-play" aria-hidden="true">
                  ▶
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
}
