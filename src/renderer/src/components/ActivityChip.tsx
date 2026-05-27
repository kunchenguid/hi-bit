import type { CreationActivity, PreviewInfo } from "@shared/chat";
import { summarizeActivity } from "../activity";

type ActivityChipProps = {
  activity: CreationActivity[];
  running?: boolean;
  /** The live preview to offer Play for, so it never scrolls away. */
  preview?: PreviewInfo | null;
  onPlay?: (projectId: string) => void;
  onSeeAll: () => void;
};

/**
 * The persistent, one-line build heartbeat that sits above the composer.
 * Calm when idle, spinning when a bot is working or Bit is thinking. Never
 * grows; the full history lives behind "See all activities". When a creation
 * has a live preview, it also carries a persistent Play so the kid can jump
 * back in even after the "ready" message scrolls off.
 */
export function ActivityChip({
  activity,
  running = false,
  preview,
  onPlay,
  onSeeAll,
}: ActivityChipProps) {
  const summary = summarizeActivity(activity, running);
  return (
    <div className="hb-activity-chip" data-state={summary.working ? "working" : "idle"}>
      <div className="hb-activity-status">
        <span className="hb-activity-dot" aria-hidden="true" />
        <span className="hb-activity-text">
          <strong>{summary.headline}</strong>
          {summary.detail ? <span>{summary.detail}</span> : null}
        </span>
      </div>
      <div className="hb-activity-actions">
        {preview && onPlay ? (
          <button
            type="button"
            className="hb-play-button hb-play-button-chip"
            onClick={() => onPlay(preview.projectId)}
          >
            <span aria-hidden="true">▶</span> Play
          </button>
        ) : null}
        {activity.length > 0 ? (
          <button type="button" className="hb-activity-seeall" onClick={onSeeAll}>
            See all activities
            {summary.count > 0 ? <span className="hb-activity-count">{summary.count}</span> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
