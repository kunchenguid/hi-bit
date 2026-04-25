import type { DreamCategory, DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { type JSX, useMemo, useState } from "react";
import {
  countDreamHistoryByCategoryFilter,
  DREAM_HISTORY_FILTERS,
  type DreamHistoryFilter,
  filterDreamHistoryByCategory,
} from "./dreamHistoryFilter";
import { describeDreamHistoryInterests } from "./dreamHistoryInterests";
import { buildDreamHistoryList } from "./dreamHistoryList";
import { describeDreamHistoryRequires } from "./dreamHistoryRequires";
import { searchDreamHistoryByText } from "./dreamHistorySearch";
import { describeDreamHistoryStyleHints } from "./dreamHistoryStyleHints";
import { describeDreamHistorySummary } from "./dreamHistorySummary";

export type ParentDreamHistoryProps = {
  dreamHistory: string[];
  library: DreamLibrary | null;
  currentDreamId?: string | null;
  graph?: KnowledgeGraph | null;
  progress?: Progress | null;
};

const CATEGORY_LABELS: Record<DreamCategory, string> = {
  arcade: "arcade",
  creative: "creative",
  personal: "personal",
  utility: "utility",
  art: "art",
};

const FILTER_LABELS: Record<DreamHistoryFilter, string> = {
  all: "all",
  ...CATEGORY_LABELS,
};

export function ParentDreamHistory({
  dreamHistory,
  library,
  currentDreamId,
  graph,
  progress,
}: ParentDreamHistoryProps): JSX.Element {
  const allEntries = useMemo(
    () => buildDreamHistoryList({ dreamHistory, library, currentDreamId }),
    [dreamHistory, library, currentDreamId],
  );
  const [filter, setFilter] = useState<DreamHistoryFilter>("all");
  const [query, setQuery] = useState<string>("");
  const entries = useMemo(
    () => searchDreamHistoryByText(filterDreamHistoryByCategory(allEntries, filter), query),
    [allEntries, filter, query],
  );
  const filterCounts = useMemo(() => countDreamHistoryByCategoryFilter(allEntries), [allEntries]);

  if (allEntries.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Dream history</h2>
        <p className="hb-parent-empty">No dreams picked yet.</p>
      </section>
    );
  }

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Dream history</h2>
      <p className="hb-parent-dream-history-hint">
        Every dream the kid has picked, most recent first.
      </p>

      <div className="hb-parent-dream-history-search">
        <label
          className="hb-parent-dream-history-search-label t-pixel"
          htmlFor="hb-parent-dream-history-search-input"
        >
          Search
        </label>
        <input
          id="hb-parent-dream-history-search-input"
          type="search"
          className="hb-parent-dream-history-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to find a dream..."
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-parent-dream-history-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>

      <fieldset className="hb-parent-dream-history-filter">
        <legend className="hb-parent-dream-history-filter-legend t-pixel">Browse by</legend>
        {DREAM_HISTORY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="hb-parent-dream-history-filter-chip t-pixel"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            <span className="hb-parent-dream-history-filter-chip-label">{FILTER_LABELS[f]}</span>
            <span className="hb-parent-dream-history-filter-chip-count">{filterCounts[f]}</span>
          </button>
        ))}
      </fieldset>

      {entries.length === 0 ? (
        <p className="hb-parent-dream-history-filter-empty">
          {query.trim().length > 0
            ? `No dreams match "${query.trim()}" in ${FILTER_LABELS[filter]}.`
            : `No dreams in ${FILTER_LABELS[filter]} yet.`}
        </p>
      ) : (
        <ul className="hb-parent-dream-history-list">
          {entries.map((e) => {
            const summary = describeDreamHistorySummary(e, library);
            const interests = describeDreamHistoryInterests(e, library);
            const styleHints = describeDreamHistoryStyleHints(e, library);
            const requires = describeDreamHistoryRequires(e, library, graph, progress);
            return (
              <li key={e.dreamId} className="hb-parent-dream-history-row">
                <span className="hb-parent-dream-history-title">{e.title}</span>
                <span className="hb-parent-dream-history-meta">
                  {e.categories.map((c) => (
                    <span key={c} className="hb-parent-dream-history-tag">
                      {CATEGORY_LABELS[c]}
                    </span>
                  ))}
                  {e.isCurrent ? (
                    <span className="t-pixel hb-parent-dream-history-current">Current</span>
                  ) : null}
                  {!e.isKnown ? (
                    <span
                      className="t-pixel hb-parent-dream-history-missing"
                      title="This dream id is no longer in the library."
                    >
                      Removed
                    </span>
                  ) : null}
                  <span className="t-pixel hb-parent-dream-history-id">{e.dreamId}</span>
                </span>
                {summary ? (
                  <p className="hb-parent-dream-history-summary" title={summary.text}>
                    <span className="t-pixel hb-parent-dream-history-summary-kicker">What</span>
                    <span className="hb-parent-dream-history-summary-text">{summary.preview}</span>
                  </p>
                ) : null}
                {interests ? (
                  <p className="hb-parent-dream-history-interests" title={interests.join(", ")}>
                    <span className="t-pixel hb-parent-dream-history-interests-kicker">
                      Interests
                    </span>
                    <span className="hb-parent-dream-history-interests-tags">
                      {interests.map((tag) => (
                        <span key={tag} className="hb-parent-dream-history-interests-tag t-pixel">
                          {tag}
                        </span>
                      ))}
                    </span>
                  </p>
                ) : null}
                {styleHints ? (
                  <p className="hb-parent-dream-history-style" title={styleHints.join(", ")}>
                    <span className="t-pixel hb-parent-dream-history-style-kicker">Style</span>
                    <span className="hb-parent-dream-history-style-tags">
                      {styleHints.map((hint) => (
                        <span key={hint} className="hb-parent-dream-history-style-tag t-pixel">
                          {hint}
                        </span>
                      ))}
                    </span>
                  </p>
                ) : null}
                {requires ? (
                  <p
                    className="hb-parent-dream-history-requires"
                    title={`Needs: ${requires.map((r) => r.title).join(", ")}`}
                  >
                    <span className="t-pixel hb-parent-dream-history-requires-kicker">Needs</span>
                    <span className="hb-parent-dream-history-requires-tags">
                      {requires.map((req) => (
                        <span
                          key={req.id}
                          className={`hb-parent-dream-history-requires-tag hb-parent-dream-history-requires-tag-${req.state} t-pixel`}
                          title={req.known ? req.title : `${req.id} (orphan)`}
                        >
                          {req.title}
                        </span>
                      ))}
                    </span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
