import type { CreationActivity, ToolActivity } from "@shared/chat";
import { friendlyStep } from "../activity";

type ActivityViewProps = {
  activity: CreationActivity[];
  onClose: () => void;
};

/**
 * The full "See all activities" surface, openable by kid or grown-up. Groups
 * every step the bots took by creation, newest first, read from the durable log.
 */
export function ActivityView({ activity, onClose }: ActivityViewProps) {
  return (
    <div className="hb-activity-view-backdrop">
      <section className="hb-card hb-activity-view" aria-label="All activities">
        <header className="hb-activity-view-head">
          <span className="hb-bit-badge" aria-hidden="true">
            🤖
          </span>
          <div className="hb-activity-view-title">
            <h2>Everything the bots worked on</h2>
            <p className="t-small">Tap a creation to see every step the bots took.</p>
          </div>
          <button type="button" className="hb-button hb-button-secondary" onClick={onClose}>
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
                  <p className="t-small">Getting started...</p>
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
  if (status === "failed") return "retried";
  return "running";
}
