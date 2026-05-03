import type { ParentFlag } from "@shared/flag";
import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { TranscriptEvent, TranscriptEventKind } from "@shared/transcript";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useAuditStore } from "../../state/auditStore";
import { useFlagStore } from "../../state/flagStore";
import {
  AUDIT_ROLE_FILTER_LABELS,
  AUDIT_ROLE_FILTERS,
  type AuditRoleFilter,
  countAuditSessionsByRoleFilter,
  filterSessionsByRole,
} from "./auditSessionFilter";
import { searchAuditSessionsByText } from "./auditSessionSearch";
import { buildFlagFromEvent, findMatchingFlag } from "./flagBuilder";
import { describeParentRelativeTime } from "./parentRelativeTime";
import { describeSessionFailures } from "./sessionFailures";
import { describeSessionTokens, formatTokenCount } from "./sessionTokens";

export type ParentAuditProps = {
  profileId: string;
};

const KIND_LABEL: Record<TranscriptEventKind, string> = {
  user_message: "Kid",
  assistant_message: "Bit",
  tool_call: "Tool",
  tool_result: "Tool result",
  error: "Error",
  system_event: "System",
};

const FLAGGABLE_KINDS = new Set<TranscriptEventKind>(["user_message", "assistant_message"]);

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function sessionLabel(entry: HarnessInvocationLogEntry): string {
  const id = entry.sessionId.length > 10 ? `${entry.sessionId.slice(0, 8)}...` : entry.sessionId;
  return `${entry.role} - ${entry.harness} - ${id}`;
}

function groupBySession(
  sessions: HarnessInvocationLogEntry[],
): Map<string, HarnessInvocationLogEntry[]> {
  const grouped = new Map<string, HarnessInvocationLogEntry[]>();
  for (const s of sessions) {
    const bucket = grouped.get(s.sessionId) ?? [];
    bucket.push(s);
    grouped.set(s.sessionId, bucket);
  }
  return grouped;
}

export function ParentAudit({ profileId }: ParentAuditProps): JSX.Element {
  const sessions = useAuditStore((s) => s.sessions);
  const status = useAuditStore((s) => s.status);
  const error = useAuditStore((s) => s.error);
  const loadedProfileId = useAuditStore((s) => s.profileId);
  const activeSessionId = useAuditStore((s) => s.activeSessionId);
  const transcript = useAuditStore((s) => s.transcript);
  const transcriptStatus = useAuditStore((s) => s.transcriptStatus);
  const transcriptError = useAuditStore((s) => s.transcriptError);
  const loadSessions = useAuditStore((s) => s.loadSessions);
  const loadTranscript = useAuditStore((s) => s.loadTranscript);
  const clearTranscript = useAuditStore((s) => s.clearTranscript);

  const flags = useFlagStore((s) => s.flags);
  const flagProfileId = useFlagStore((s) => s.profileId);
  const loadFlags = useFlagStore((s) => s.load);
  const saveFlag = useFlagStore((s) => s.save);
  const removeFlag = useFlagStore((s) => s.remove);
  const writeStatus = useFlagStore((s) => s.writeStatus);
  const writeError = useFlagStore((s) => s.writeError);

  const [roleFilter, setRoleFilter] = useState<AuditRoleFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (loadedProfileId !== profileId) void loadSessions(profileId);
  }, [profileId, loadedProfileId, loadSessions]);

  useEffect(() => {
    if (flagProfileId !== profileId) void loadFlags(profileId);
  }, [profileId, flagProfileId, loadFlags]);

  const filteredSessions = useMemo(
    () => searchAuditSessionsByText(filterSessionsByRole(sessions, roleFilter), query),
    [sessions, roleFilter, query],
  );

  const roleCounts = useMemo(() => countAuditSessionsByRoleFilter(sessions), [sessions]);
  const trimmedQuery = query.trim();

  if (status === "loading") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Transcripts</h2>
        <p className="hb-parent-empty">Loading sessions...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Transcripts</h2>
        <p className="hb-parent-empty">Could not load sessions: {error}</p>
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Transcripts</h2>
        <p className="hb-parent-empty">
          No sessions yet. They will appear here after the first chat.
        </p>
      </section>
    );
  }

  const grouped = groupBySession(filteredSessions);
  const uniqueIds = Array.from(grouped.keys());

  let emptyText: string | null = null;
  if (uniqueIds.length === 0) {
    if (trimmedQuery.length > 0 && roleFilter !== "all") {
      emptyText = `No ${roleFilter} sessions match "${trimmedQuery}".`;
    } else if (trimmedQuery.length > 0) {
      emptyText = `No sessions match "${trimmedQuery}".`;
    } else {
      emptyText = `No ${roleFilter} sessions yet.`;
    }
  }

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Transcripts</h2>
      <div className="hb-audit-search">
        <label className="t-pixel hb-audit-search-label" htmlFor="hb-audit-search-input">
          Search
        </label>
        <input
          id="hb-audit-search-input"
          type="search"
          className="hb-audit-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="role, agent, session id, date"
        />
        {trimmedQuery.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-audit-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>
      <fieldset className="hb-audit-filter">
        <legend className="hb-audit-filter-legend t-pixel">Show</legend>
        {AUDIT_ROLE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="hb-audit-filter-chip t-pixel"
            aria-pressed={roleFilter === f}
            onClick={() => setRoleFilter(f)}
          >
            <span className="hb-audit-filter-chip-label">{AUDIT_ROLE_FILTER_LABELS[f]}</span>
            <span className="hb-audit-filter-chip-count">{roleCounts[f]}</span>
          </button>
        ))}
      </fieldset>
      {emptyText ? <p className="hb-parent-empty">{emptyText}</p> : null}
      <ul className="hb-audit-sessions">
        {uniqueIds.map((sessionId) => {
          const entries = grouped.get(sessionId) ?? [];
          const first = entries[0];
          if (!first) return null;
          const totalMs = entries.reduce((acc, e) => acc + e.durationMs, 0);
          const failures = describeSessionFailures(entries);
          const tokens = describeSessionTokens(entries);
          const isActive = activeSessionId === sessionId;
          return (
            <li key={sessionId} className="hb-audit-session">
              <button
                type="button"
                className="hb-audit-session-toggle"
                onClick={() => {
                  if (isActive) clearTranscript();
                  else void loadTranscript(profileId, sessionId);
                }}
                aria-expanded={isActive}
              >
                <span className="hb-audit-session-label">{sessionLabel(first)}</span>
                {failures ? (
                  <span
                    className="t-pixel hb-audit-session-failures"
                    title={`${failures.failureCount} of ${failures.totalTurns} turn${
                      failures.totalTurns === 1 ? "" : "s"
                    } exited non-zero or on a signal`}
                  >
                    {failures.failureCount}/{failures.totalTurns} failed
                  </span>
                ) : null}
                {tokens ? (
                  <span
                    className="t-pixel hb-audit-session-tokens"
                    title={
                      typeof tokens.contextTokensUsed === "number" &&
                      tokens.tokensInput === 0 &&
                      tokens.tokensOutput === 0
                        ? `${tokens.contextTokensUsed.toLocaleString()}${
                            typeof tokens.contextTokensSize === "number"
                              ? ` of ${tokens.contextTokensSize.toLocaleString()}`
                              : ""
                          } context tokens used across ${entries.length} turn${
                            entries.length === 1 ? "" : "s"
                          }`
                        : `${tokens.tokensInput.toLocaleString()} input + ${tokens.tokensOutput.toLocaleString()} output = ${tokens.total.toLocaleString()} tokens across ${entries.length} turn${
                            entries.length === 1 ? "" : "s"
                          }`
                    }
                  >
                    {typeof tokens.contextTokensUsed === "number" &&
                    tokens.tokensInput === 0 &&
                    tokens.tokensOutput === 0 ? (
                      <>
                        {formatTokenCount(tokens.contextTokensUsed)}
                        {typeof tokens.contextTokensSize === "number"
                          ? ` / ${formatTokenCount(tokens.contextTokensSize)}`
                          : ""}{" "}
                        ctx
                      </>
                    ) : (
                      <>
                        {formatTokenCount(tokens.tokensInput)} in /{" "}
                        {formatTokenCount(tokens.tokensOutput)} out
                      </>
                    )}
                  </span>
                ) : null}
                <span className="hb-audit-session-meta">
                  {describeParentRelativeTime(first.timestamp)} - {entries.length} turn
                  {entries.length === 1 ? "" : "s"} - {formatDuration(totalMs)}
                </span>
              </button>
              {isActive ? (
                <div className="hb-audit-transcript">
                  {transcriptStatus === "loading" ? (
                    <p className="hb-parent-empty">Loading transcript...</p>
                  ) : transcriptStatus === "error" ? (
                    <p className="hb-parent-empty">Could not load transcript: {transcriptError}</p>
                  ) : transcript.length === 0 ? (
                    <p className="hb-parent-empty">No transcript recorded for this session.</p>
                  ) : (
                    <ol className="hb-audit-events">
                      {transcript.map((event) => (
                        <AuditEventRow
                          key={`${event.timestamp}-${event.kind}-${event.text.length}`}
                          event={event}
                          existingFlag={findMatchingFlag(flags, event, sessionId)}
                          onFlag={async (reason) => {
                            const built = buildFlagFromEvent(event, sessionId, reason);
                            if (!built.ok) return built;
                            const ok = await saveFlag(profileId, built.flag);
                            return ok
                              ? { ok: true as const }
                              : { ok: false as const, error: writeError ?? "Could not save flag" };
                          }}
                          onUnflag={async (flag) => {
                            const ok = await removeFlag(profileId, flag);
                            return ok
                              ? { ok: true as const }
                              : {
                                  ok: false as const,
                                  error: writeError ?? "Could not remove flag",
                                };
                          }}
                          saving={writeStatus === "saving"}
                        />
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type FlagSubmitResult = { ok: true } | { ok: false; error: string };

function AuditEventRow({
  event,
  existingFlag,
  onFlag,
  onUnflag,
  saving,
}: {
  event: TranscriptEvent;
  existingFlag: ParentFlag | undefined;
  onFlag: (reason: string) => Promise<FlagSubmitResult>;
  onUnflag: (flag: ParentFlag) => Promise<FlagSubmitResult>;
  saving: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const flaggable = FLAGGABLE_KINDS.has(event.kind);

  async function submit(): Promise<void> {
    setLocalError(null);
    const result = await onFlag(reason);
    if (result.ok) {
      setOpen(false);
      setReason("");
    } else {
      setLocalError(result.error);
    }
  }

  async function unflag(): Promise<void> {
    if (!existingFlag) return;
    setLocalError(null);
    const result = await onUnflag(existingFlag);
    if (!result.ok) {
      setLocalError(result.error);
    }
  }

  return (
    <li className={`hb-audit-event hb-audit-event-${event.kind}`}>
      <div className="hb-audit-event-head">
        <span className="t-pixel hb-audit-event-kind">{KIND_LABEL[event.kind]}</span>
        <div className="hb-audit-event-actions">
          {existingFlag ? (
            <span className="t-pixel hb-audit-flag-badge" title={existingFlag.reason}>
              Flagged
            </span>
          ) : null}
          {existingFlag ? (
            <button
              type="button"
              className="hb-btn hb-btn-ghost hb-audit-flag-btn"
              onClick={() => {
                void unflag();
              }}
              disabled={saving}
            >
              {saving ? "Removing..." : "Unflag"}
            </button>
          ) : null}
          {flaggable && !existingFlag ? (
            <button
              type="button"
              className="hb-btn hb-btn-ghost hb-audit-flag-btn"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? "Cancel" : "Flag"}
            </button>
          ) : null}
          <span className="hb-audit-event-time">{describeParentRelativeTime(event.timestamp)}</span>
        </div>
      </div>
      <div className="hb-audit-event-text">{event.text}</div>
      {existingFlag ? (
        <div className="hb-audit-flag-note">
          <span className="t-pixel hb-audit-flag-note-kicker">Reason</span>
          <span>{existingFlag.reason}</span>
        </div>
      ) : null}
      {existingFlag && localError ? <p className="hb-audit-flag-error">{localError}</p> : null}
      {open && !existingFlag ? (
        <form
          className="hb-audit-flag-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !saving) {
              e.preventDefault();
              setOpen(false);
            }
          }}
        >
          <label className="hb-audit-flag-label" htmlFor={`flag-reason-${event.timestamp}`}>
            <span className="t-pixel hb-audit-flag-note-kicker">Why does this look wrong?</span>
            <textarea
              id={`flag-reason-${event.timestamp}`}
              className="hb-input hb-audit-flag-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. don't write the code without teaching"
              disabled={saving}
              // biome-ignore lint/a11y/noAutofocus: form is user-opened via the Flag button, focus is expected
              autoFocus
            />
          </label>
          {localError ? <p className="hb-audit-flag-error">{localError}</p> : null}
          <div className="hb-audit-flag-row">
            <button
              type="submit"
              className="hb-btn hb-btn-primary"
              disabled={saving || reason.trim().length === 0}
            >
              {saving ? "Saving..." : "Save flag"}
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
