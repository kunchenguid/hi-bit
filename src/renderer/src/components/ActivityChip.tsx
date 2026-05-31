import type { CreationActivity } from "@shared/chat";
import { summarizeActivity } from "../activity";

type ActivityChipProps = {
  activity: CreationActivity[];
  running?: boolean;
  /** The playable creation to offer Play for, so it never scrolls away. */
  playProjectId?: string | null;
  onPlay?: (projectId: string) => void;
  onSeeAll: () => void;
};

/**
 * The persistent, one-line build heartbeat that sits above the composer.
 * Calm when idle, spinning when a bot is working or Bit is thinking. Never
 * grows; the full history lives behind the Logbook. When a creation has a live
 * preview, it also carries a persistent Play so the kid can jump back in even
 * after the "ready" message scrolls off.
 */
export function ActivityChip({
  activity,
  running = false,
  playProjectId,
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
          {/* Always render the detail line - even when empty - so the bar keeps
              a constant height and never shifts the chat when a detail appears
              or clears. */}
          <span className="hb-activity-detail">{summary.detail}</span>
        </span>
      </div>
      <div className="hb-activity-actions">
        {playProjectId && onPlay ? (
          <button
            type="button"
            className="hb-play-button hb-play-button-chip"
            onClick={() => onPlay(playProjectId)}
          >
            <span aria-hidden="true">▶</span> Play
          </button>
        ) : null}
        {activity.length > 0 ? (
          <button type="button" className="hb-activity-seeall" onClick={onSeeAll}>
            Open Logbook
            {summary.count > 0 ? <span className="hb-activity-count">{summary.count}</span> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
