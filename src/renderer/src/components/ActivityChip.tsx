import type { CreationActivity } from "@shared/chat";
import { summarizeActivity } from "../activity";

type ActivityChipProps = {
  activity: CreationActivity[];
  onSeeAll: () => void;
};

/**
 * The persistent, one-line build heartbeat that sits above the composer.
 * Calm when idle, spinning when a bot is working. Never grows; the full history
 * lives behind "See all activities".
 */
export function ActivityChip({ activity, onSeeAll }: ActivityChipProps) {
  const summary = summarizeActivity(activity);
  return (
    <div className="hb-activity-chip" data-state={summary.working ? "working" : "idle"}>
      <div className="hb-activity-status">
        <span className="hb-activity-dot" aria-hidden="true" />
        <span className="hb-activity-text">
          <strong>{summary.headline}</strong>
          {summary.detail ? <span>{summary.detail}</span> : null}
        </span>
      </div>
      {summary.working || summary.count > 0 ? (
        <button type="button" className="hb-activity-seeall" onClick={onSeeAll}>
          See all activities
          {summary.count > 0 ? <span className="hb-activity-count">{summary.count}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
