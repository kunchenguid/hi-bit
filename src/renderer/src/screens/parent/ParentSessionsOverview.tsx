import { DEFAULT_SESSION_TARGET_MINUTES } from "@shared/profile";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useAuditStore } from "../../state/auditStore";
import {
  type ActiveSessionInfo,
  type ActiveSessionStatus,
  buildActiveSessionsPanel,
} from "./activeSession";
import { describeParentRelativeTime } from "./parentRelativeTime";
import {
  normalizeRecentSessionsSearchQuery,
  searchRecentSessionsByText,
} from "./recentSessionsSearch";
import { buildRecentSessionsSummary, DEFAULT_RECENT_SESSIONS_LIMIT } from "./recentSessionsSummary";
import { describeSessionStarted } from "./sessionStarted";
import {
  countRecentSessionsByRoleFilter,
  filterRecentSessionsByRole,
  SESSIONS_ROLE_FILTER_LABELS,
  SESSIONS_ROLE_FILTERS,
  type SessionsRoleFilter,
} from "./sessionsRoleFilter";

export type ParentSessionsOverviewProps = {
  profileId: string;
  targetMinutes?: number;
};

const STATUS_LABEL: Record<ActiveSessionStatus, string> = {
  under: "Under target",
  near: "Near target",
  over: "Over target",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function roleLabel(role: "kid" | "parent"): string {
  return role === "kid" ? "Kid" : "Parent";
}

function renderActiveSessionRow(session: ActiveSessionInfo, targetMinutes: number): JSX.Element {
  const turns = session.turnCount === 1 ? "1 turn" : `${session.turnCount} turns`;
  const statusLabel = STATUS_LABEL[session.status];
  return (
    <li
      key={session.role}
      className={`hb-parent-active-session hb-parent-active-session-${session.status}`}
    >
      <span className="t-pixel hb-parent-active-session-role">{roleLabel(session.role)}</span>
      <span className="hb-parent-active-session-elapsed">
        {session.elapsedMinutes}m{" "}
        <span className="hb-parent-active-session-target">/ {targetMinutes}m</span>
      </span>
      <span className="hb-parent-active-session-meta">{turns}</span>
      <span
        className={`t-pixel hb-parent-active-session-status hb-parent-active-session-status-${session.status}`}
      >
        {statusLabel}
      </span>
    </li>
  );
}

export function ParentSessionsOverview({
  profileId,
  targetMinutes,
}: ParentSessionsOverviewProps): JSX.Element {
  const sessions = useAuditStore((s) => s.sessions);
  const status = useAuditStore((s) => s.status);
  const error = useAuditStore((s) => s.error);
  const loadedProfileId = useAuditStore((s) => s.profileId);
  const loadSessions = useAuditStore((s) => s.loadSessions);

  useEffect(() => {
    if (loadedProfileId !== profileId) void loadSessions(profileId);
  }, [profileId, loadedProfileId, loadSessions]);

  const resolvedTargetMinutes = targetMinutes ?? DEFAULT_SESSION_TARGET_MINUTES;
  const [filter, setFilter] = useState<SessionsRoleFilter>("all");
  const [query, setQuery] = useState<string>("");
  const summary = useMemo(() => buildRecentSessionsSummary(sessions, 0), [sessions]);
  const trimmedQuery = normalizeRecentSessionsSearchQuery(query);
  const filteredRows = useMemo(
    () => searchRecentSessionsByText(filterRecentSessionsByRole(summary.rows, filter), query),
    [summary.rows, filter, query],
  );
  const cappedRows = useMemo(
    () =>
      trimmedQuery.length > 0 ? filteredRows : filteredRows.slice(0, DEFAULT_RECENT_SESSIONS_LIMIT),
    [filteredRows, trimmedQuery],
  );
  const filterCounts = useMemo(() => countRecentSessionsByRoleFilter(summary.rows), [summary.rows]);
  const activePanel = useMemo(
    () =>
      buildActiveSessionsPanel({
        entries: sessions,
        targetMinutes: resolvedTargetMinutes,
        nowMs: Date.now(),
      }),
    [sessions, resolvedTargetMinutes],
  );
  const hasActive = activePanel.kid !== null || activePanel.parent !== null;

  if (status === "loading" && sessions.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Recent sessions</h2>
        <p className="hb-parent-empty">Loading session log...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Recent sessions</h2>
        <p className="hb-parent-empty">Could not load session log{error ? `: ${error}` : "."}</p>
      </section>
    );
  }

  if (summary.rows.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Recent sessions</h2>
        <p className="hb-parent-empty">
          No sessions yet. They will show here after the first chat.
        </p>
      </section>
    );
  }

  const { totals } = summary;
  const hintText =
    trimmedQuery.length > 0
      ? `${cappedRows.length} match${cappedRows.length === 1 ? "" : "es"} for "${trimmedQuery}" across ${summary.rows.length} sessions.`
      : filter === "all"
        ? `The last ${cappedRows.length} session${cappedRows.length === 1 ? "" : "s"} across kid and parent modes.`
        : `The last ${cappedRows.length} ${filter} session${cappedRows.length === 1 ? "" : "s"} out of ${filterCounts[filter]} total.`;
  const emptyText =
    trimmedQuery.length > 0
      ? filter === "all"
        ? `No sessions match "${trimmedQuery}".`
        : `No ${filter} sessions match "${trimmedQuery}".`
      : `No ${filter} sessions yet.`;

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Recent sessions</h2>
      {hasActive ? (
        <div className="hb-parent-active-sessions">
          <div className="t-pixel hb-parent-active-sessions-kicker">Active now</div>
          <ul className="hb-parent-active-sessions-list">
            {activePanel.kid
              ? renderActiveSessionRow(activePanel.kid, resolvedTargetMinutes)
              : null}
            {activePanel.parent
              ? renderActiveSessionRow(activePanel.parent, resolvedTargetMinutes)
              : null}
          </ul>
        </div>
      ) : null}
      <div className="hb-parent-sessions-search">
        <label
          className="hb-parent-sessions-search-label t-pixel"
          htmlFor="hb-parent-sessions-search-input"
        >
          Search
        </label>
        <input
          id="hb-parent-sessions-search-input"
          type="search"
          className="hb-parent-sessions-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a session by role, agent, id, or date..."
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-parent-sessions-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="hb-parent-sessions-hint">{hintText}</p>
      <dl className="hb-parent-sessions-totals">
        <div className="hb-parent-sessions-total">
          <dt className="t-pixel hb-parent-sessions-total-kicker">Kid</dt>
          <dd className="hb-parent-sessions-total-value">{totals.kidSessions}</dd>
        </div>
        <div className="hb-parent-sessions-total">
          <dt className="t-pixel hb-parent-sessions-total-kicker">Parent</dt>
          <dd className="hb-parent-sessions-total-value">{totals.parentSessions}</dd>
        </div>
        <div className="hb-parent-sessions-total">
          <dt className="t-pixel hb-parent-sessions-total-kicker">Total time</dt>
          <dd className="hb-parent-sessions-total-value">
            {formatDuration(totals.totalDurationMs)}
          </dd>
        </div>
      </dl>
      <fieldset className="hb-parent-sessions-filter">
        <legend className="t-pixel hb-parent-sessions-filter-legend">Role</legend>
        {SESSIONS_ROLE_FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            className="hb-parent-sessions-filter-chip"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {SESSIONS_ROLE_FILTER_LABELS[id]}
            <span className="hb-parent-sessions-filter-chip-count">{filterCounts[id]}</span>
          </button>
        ))}
      </fieldset>
      {cappedRows.length === 0 ? (
        <p className="hb-parent-sessions-filter-empty">{emptyText}</p>
      ) : (
        <ul className="hb-parent-sessions-list">
          {cappedRows.map((row) => {
            const started = describeSessionStarted(row);
            return (
              <li key={row.sessionId} className="hb-parent-sessions-row">
                <div className="hb-parent-sessions-head">
                  <span className="t-pixel hb-parent-sessions-role">{roleLabel(row.role)}</span>
                  <span className="t-pixel hb-parent-sessions-harness">{row.harness}</span>
                  {started ? (
                    <span
                      className="t-pixel hb-parent-sessions-started"
                      title={`Started ${started.startedAt}`}
                    >
                      Started {started.relative}
                    </span>
                  ) : null}
                  <span className="hb-parent-sessions-time">
                    {describeParentRelativeTime(row.lastAt)}
                  </span>
                </div>
                <div className="hb-parent-sessions-meta">
                  {row.turnCount} turn{row.turnCount === 1 ? "" : "s"} -{" "}
                  {formatDuration(row.totalDurationMs)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
