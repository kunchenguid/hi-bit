import { type JSX, useEffect, useMemo, useState } from "react";
import { useParentChatStore } from "../../state/parentChatStore";
import { buildParentDirectivesOverview, DEFAULT_DIRECTIVES_LIMIT } from "./parentDirectivesList";
import { searchParentDirectivesByText } from "./parentDirectivesSearch";
import { describeParentRelativeTime } from "./parentRelativeTime";

export type ParentDirectivesOverviewProps = {
  profileId: string;
  parentSessionId: string;
};

export function ParentDirectivesOverview({
  profileId,
  parentSessionId,
}: ParentDirectivesOverviewProps): JSX.Element {
  const messages = useParentChatStore((s) => s.messages);
  const hydrate = useParentChatStore((s) => s.hydrate);
  const hydrateStatus = useParentChatStore((s) => s.hydrateStatus);
  const hydrateError = useParentChatStore((s) => s.hydrateError);
  const hydratedSessionId = useParentChatStore((s) => s.hydratedSessionId);

  useEffect(() => {
    if (hydratedSessionId === parentSessionId) return;
    void hydrate(profileId, parentSessionId);
  }, [profileId, parentSessionId, hydratedSessionId, hydrate]);

  const [query, setQuery] = useState<string>("");
  const trimmedQuery = query.trim();
  const allEntries = useMemo(() => buildParentDirectivesOverview(messages, 0), [messages]);
  const matched = useMemo(
    () => searchParentDirectivesByText(allEntries, query),
    [allEntries, query],
  );
  const entries = useMemo(
    () => (trimmedQuery.length > 0 ? matched : matched.slice(0, DEFAULT_DIRECTIVES_LIMIT)),
    [matched, trimmedQuery],
  );

  if (hydrateStatus === "loading" && allEntries.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Recent directives</h2>
        <p className="hb-parent-empty">Loading past directives...</p>
      </section>
    );
  }

  if (hydrateStatus === "error") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Recent directives</h2>
        <p className="hb-parent-empty">
          Could not load past directives{hydrateError ? `: ${hydrateError}` : "."}
        </p>
      </section>
    );
  }

  if (allEntries.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Recent directives</h2>
        <p className="hb-parent-empty">
          No directives yet. Message Bit below to tell it how to pace or focus the next sessions.
        </p>
      </section>
    );
  }

  const hintText =
    trimmedQuery.length > 0
      ? `${entries.length} match${entries.length === 1 ? "" : "es"} for "${trimmedQuery}" across ${allEntries.length} directive${allEntries.length === 1 ? "" : "s"}.`
      : `The last ${entries.length} thing${entries.length === 1 ? "" : "s"} you told Bit. These sit in the state file and shape Bit's next turns.`;

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Recent directives</h2>
      <p className="hb-parent-directives-hint">{hintText}</p>

      <div className="hb-parent-directives-search">
        <label
          className="hb-parent-directives-search-label t-pixel"
          htmlFor="hb-parent-directives-search-input"
        >
          Search
        </label>
        <input
          id="hb-parent-directives-search-input"
          type="search"
          className="hb-parent-directives-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to find a past directive..."
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-parent-directives-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="hb-parent-directives-search-empty">No directives match "{trimmedQuery}".</p>
      ) : (
        <ol className="hb-parent-directives-list">
          {entries.map((e) => (
            <li key={e.id} className="hb-parent-directives-row">
              <div className="hb-parent-directives-head">
                <span className="t-pixel hb-parent-directives-kicker">You said</span>
                <span className="hb-parent-directives-time">
                  {describeParentRelativeTime(e.timestamp)}
                </span>
              </div>
              <div className="hb-parent-directives-preview">{e.preview}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
