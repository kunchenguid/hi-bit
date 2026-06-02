import factoryMark from "@design/assets/logo-mark.svg";
import type { CreationActivity } from "@shared/chat";
import { summarizeActivity } from "../activity";
import { countWorkingBots } from "../factory";

type ActivityChipProps = {
  activity: CreationActivity[];
  running?: boolean;
  /** The playable creation to offer Play for, so it never scrolls away. */
  playProjectId?: string | null;
  onPlay?: (projectId: string) => void;
  /** How many creations the kid has, deciding whether a direct Play shows. */
  creationCount?: number;
  /** Opens the factory floor - the merged creations + Logbook surface. */
  onOpenFactory: () => void;
};

/**
 * The persistent, one-line build heartbeat that sits above the composer. Calm
 * when idle, spinning when a bot is working or Bit is thinking. Never grows; the
 * whole factory floor (every creation, its bots, and their steps) lives behind
 * the one "The Factory" button, whose badge counts the bots building right now.
 * A single creation also keeps a direct Play so the kid can jump back in even
 * after the "ready" message scrolls off.
 */
export function ActivityChip({
  activity,
  running = false,
  playProjectId,
  onPlay,
  creationCount = 0,
  onOpenFactory,
}: ActivityChipProps) {
  const summary = summarizeActivity(activity, running);
  const workingBots = countWorkingBots(activity);
  const hasFactory = creationCount > 0 || activity.length > 0;
  // A direct Play is the fast path while there is only one creation; past that,
  // the factory floor is where the kid picks which creation to play.
  const showQuickPlay = creationCount < 2 && playProjectId && onPlay;

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
        {showQuickPlay ? (
          <button
            type="button"
            className="hb-play-button hb-play-button-chip"
            onClick={() => onPlay?.(playProjectId)}
          >
            <span aria-hidden="true">▶</span> Play
          </button>
        ) : null}
        {hasFactory ? (
          <button
            type="button"
            className="hb-factory-button"
            data-working={workingBots > 0 ? "true" : "false"}
            onClick={onOpenFactory}
          >
            <img className="pixel-art" src={factoryMark} alt="" width={18} height={18} />
            The Factory
            {workingBots > 0 ? <span className="hb-factory-badge">{workingBots}</span> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
