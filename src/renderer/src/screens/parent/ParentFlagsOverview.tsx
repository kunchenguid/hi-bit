import { type JSX, useEffect, useMemo, useState } from "react";
import { useFlagStore } from "../../state/flagStore";
import { describeFlagMessageTime } from "./flagMessageTime";
import {
  countParentFlagsBySpeakerFilter,
  filterParentFlagsBySpeaker,
  PARENT_FLAGS_FILTER_LABELS,
  PARENT_FLAGS_FILTERS,
  type ParentFlagsFilter,
} from "./parentFlagsFilter";
import { buildParentFlagsOverview } from "./parentFlagsList";
import { searchParentFlagsByText } from "./parentFlagsSearch";
import { describeParentRelativeTime } from "./parentRelativeTime";

export type ParentFlagsOverviewProps = {
  profileId: string;
};

export function ParentFlagsOverview({ profileId }: ParentFlagsOverviewProps): JSX.Element {
  const flags = useFlagStore((s) => s.flags);
  const status = useFlagStore((s) => s.status);
  const error = useFlagStore((s) => s.error);
  const loadedProfileId = useFlagStore((s) => s.profileId);
  const load = useFlagStore((s) => s.load);
  const remove = useFlagStore((s) => s.remove);
  const writeStatus = useFlagStore((s) => s.writeStatus);
  const writeError = useFlagStore((s) => s.writeError);

  useEffect(() => {
    if (loadedProfileId !== profileId) void load(profileId);
  }, [profileId, loadedProfileId, load]);

  const [query, setQuery] = useState<string>("");
  const [filter, setFilter] = useState<ParentFlagsFilter>("all");
  const trimmedQuery = query.trim();
  const allEntries = useMemo(() => buildParentFlagsOverview(flags), [flags]);
  const entries = useMemo(
    () => searchParentFlagsByText(filterParentFlagsBySpeaker(allEntries, filter), query),
    [allEntries, filter, query],
  );
  const filterCounts = useMemo(() => countParentFlagsBySpeakerFilter(allEntries), [allEntries]);

  if (status === "loading") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Flagged messages</h2>
        <p className="hb-parent-empty">Loading flags...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Flagged messages</h2>
        <p className="hb-parent-empty">Could not load flags: {error}</p>
      </section>
    );
  }

  if (allEntries.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Flagged messages</h2>
        <p className="hb-parent-empty">
          No messages flagged yet. Flag one in the transcripts below to pass it to Bit as a thing to
          avoid.
        </p>
      </section>
    );
  }

  const hintText =
    trimmedQuery.length > 0
      ? `${entries.length} match${entries.length === 1 ? "" : "es"} for "${trimmedQuery}" across ${allEntries.length} flag${allEntries.length === 1 ? "" : "s"}.`
      : `${allEntries.length} flag${allEntries.length === 1 ? "" : "s"} in Bit's state file. Unflag to clear.`;
  const filterEmptyText =
    trimmedQuery.length > 0
      ? `No flags match "${trimmedQuery}" in ${PARENT_FLAGS_FILTER_LABELS[filter]}.`
      : `No ${PARENT_FLAGS_FILTER_LABELS[filter]} flags yet.`;

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Flagged messages</h2>
      <p className="hb-parent-flags-hint">{hintText}</p>
      {writeError ? <p className="hb-audit-flag-error">{writeError}</p> : null}

      <div className="hb-parent-flags-search">
        <label
          className="hb-parent-flags-search-label t-pixel"
          htmlFor="hb-parent-flags-search-input"
        >
          Search
        </label>
        <input
          id="hb-parent-flags-search-input"
          type="search"
          className="hb-parent-flags-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to find a flagged message..."
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-parent-flags-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>

      <fieldset className="hb-parent-flags-filter">
        <legend className="hb-parent-flags-filter-legend t-pixel">Speaker</legend>
        {PARENT_FLAGS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="hb-parent-flags-filter-chip t-pixel"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            <span className="hb-parent-flags-filter-chip-label">
              {PARENT_FLAGS_FILTER_LABELS[f]}
            </span>
            <span className="hb-parent-flags-filter-chip-count">{filterCounts[f]}</span>
          </button>
        ))}
      </fieldset>

      {entries.length === 0 ? (
        <p className="hb-parent-flags-search-empty">{filterEmptyText}</p>
      ) : null}
      <ul className="hb-parent-flags-list">
        {entries.map((e) => {
          const key = `${e.flag.flaggedAt}-${e.flag.messageTimestamp}-${e.flag.sessionId}`;
          const messageTime = describeFlagMessageTime(e.flag);
          return (
            <li key={key} className="hb-parent-flags-row">
              <div className="hb-parent-flags-head">
                <span className="t-pixel hb-parent-flags-speaker">{e.speakerLabel}</span>
                {messageTime ? (
                  <span
                    className="t-pixel hb-parent-flags-message-time"
                    title={messageTime.messageTimestamp}
                  >
                    Message {messageTime.relative}
                  </span>
                ) : null}
                <span className="hb-parent-flags-time">
                  {describeParentRelativeTime(e.flag.flaggedAt)}
                </span>
                <button
                  type="button"
                  className="hb-btn hb-btn-ghost hb-parent-flags-unflag"
                  onClick={() => {
                    void remove(profileId, e.flag);
                  }}
                  disabled={writeStatus === "saving"}
                >
                  {writeStatus === "saving" ? "Removing..." : "Unflag"}
                </button>
              </div>
              <div className="hb-parent-flags-preview">{e.preview}</div>
              <div className="hb-parent-flags-reason">
                <span className="t-pixel hb-parent-flags-reason-kicker">Reason</span>
                <span>{e.flag.reason}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
