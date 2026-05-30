import mascotBit from "@design/assets/mascot-boo.svg";
import type { CreationActivity, ToolActivity } from "@shared/chat";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { friendlyStep } from "../activity";

type ActivityViewProps = {
  activity: CreationActivity[];
  /** Whether the kid has unlocked the "Logbook" word, which retitles this surface. */
  logbookUnlocked?: boolean;
  botUnlocked?: boolean;
  onClose: () => void;
};

/**
 * The full "See all activities" surface, openable by kid or grown-up. Groups
 * every step the bots took by creation, newest first, read from the durable log.
 */
export function ActivityView({
  activity,
  logbookUnlocked = false,
  botUnlocked = false,
  onClose,
}: ActivityViewProps) {
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

  const workerLabel = botUnlocked ? "bots" : "builders";

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

  return (
    <div className="hb-activity-view-backdrop">
      <section
        className="hb-card hb-activity-view"
        aria-label="All activities"
        aria-modal="true"
        onKeyDown={keepFocusInside}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="hb-activity-view-head">
          <span className="hb-bit-badge" aria-hidden="true">
            <img
              className="hb-bit-badge-mascot pixel-art"
              src={mascotBit}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div className="hb-activity-view-title">
            <h2>{logbookUnlocked ? "Your Logbook" : `Everything the ${workerLabel} worked on`}</h2>
            <p className="t-small">Tap a creation to see every step the {workerLabel} took.</p>
          </div>
          <button type="button" className="hb-button hb-button-secondary" onClick={close}>
            Close
          </button>
        </header>

        {activity.length === 0 ? (
          <p className="t-small">No activities yet. Ask Bit to build something!</p>
        ) : (
          activity.map((creation) => (
            <details
              className="hb-creation-group"
              key={creation.projectId}
              open={creation.status === "working"}
            >
              <summary className="hb-creation-head">
                <span className="hb-creation-chiplet" aria-hidden="true">
                  {creation.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="hb-creation-meta">
                  <strong>{creation.title}</strong>
                  <span>{creationSubtitle(creation)}</span>
                </span>
                <span
                  className={`hb-creation-state ${creation.status === "working" ? "is-working" : "is-done"}`}
                >
                  {creation.status === "working" ? "working" : "done"}
                </span>
              </summary>
              <div className="hb-creation-steps">
                {creation.steps.length === 0 ? (
                  <p className="t-small">
                    {creation.status === "working" ? "Getting started..." : "No visible steps"}
                  </p>
                ) : (
                  creation.steps.map((step) => (
                    <div className="hb-step" key={`${step.turnId ?? ""}:${step.callId}`}>
                      <span className="hb-step-grow">{friendlyStep(step.toolName)}</span>
                      <span className={`hb-tool-status hb-tool-status-${step.status}`}>
                        {stepStatusLabel(step.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </details>
          ))
        )}
      </section>
    </div>
  );
}

function creationSubtitle(creation: CreationActivity): string {
  const steps = `${creation.steps.length} ${creation.steps.length === 1 ? "step" : "steps"}`;
  return creation.status === "working" ? `working on it now - ${steps}` : steps;
}

function stepStatusLabel(status: ToolActivity["status"]): string {
  if (status === "completed") return "done";
  if (status === "failed") return "stopped";
  return "running";
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
}
