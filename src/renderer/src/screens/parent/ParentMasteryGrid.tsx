import type { KnowledgeGraph, KnowledgePoint, KnowledgePointArea } from "@shared/knowledgeGraph";
import { KP_AREAS } from "@shared/knowledgeGraph";
import type { KnowledgePointStatus, Progress } from "@shared/progress";
import { type JSX, useMemo, useState } from "react";
import { useProgressStore } from "../../state/progressStore";
import { describeKpIntroduces } from "./kpIntroduces";
import { describeKpMasteryEvidence } from "./kpMasteryEvidence";
import { describeKpMasteryFirstSeen } from "./kpMasteryFirstSeen";
import { describeKpMasteryUpdated } from "./kpMasteryUpdated";
import { describeKpPrereqs } from "./kpPrereqs";
import { searchKpsByText } from "./kpSearch";
import { describeKpSkip } from "./kpSkipState";
import {
  countKpsByAreaFilter,
  filterKpsByArea,
  MASTERY_AREA_FILTER_LABELS,
  MASTERY_AREA_FILTERS,
  type MasteryAreaFilter,
} from "./masteryAreaFilter";
import {
  countMasteryFilterMatches,
  filterKpsByMasteryStatus,
  MASTERY_FILTER_LABELS,
  MASTERY_FILTERS,
  type MasteryFilter,
} from "./masteryFilter";
import { computeMasterySummary, type MasteryAreaSummary } from "./masterySummary";

export type ParentMasteryGridProps = {
  graph: KnowledgeGraph | null;
  progress: Progress | null;
};

const STATUS_LABEL: Record<KnowledgePointStatus, string> = {
  saw_it: "Saw it",
  did_with_help: "Did with help",
  did_unprompted: "Did unprompted",
  explained_it: "Explained it",
};

const AREA_LABEL: Record<KnowledgePointArea, string> = {
  html: "HTML",
  css: "CSS",
  js: "JavaScript",
  dom: "DOM",
  canvas: "Canvas",
  interactivity: "Interactivity",
};

const STATUS_CYCLE: (KnowledgePointStatus | null)[] = [
  null,
  "saw_it",
  "did_with_help",
  "did_unprompted",
  "explained_it",
];

function nextStatus(current: KnowledgePointStatus | undefined): KnowledgePointStatus | null {
  const idx = STATUS_CYCLE.indexOf(current ?? null);
  const nextIdx = (idx + 1) % STATUS_CYCLE.length;
  return STATUS_CYCLE[nextIdx];
}

function MasterySummaryPanel({
  summary,
}: {
  summary: ReturnType<typeof computeMasterySummary>;
}): JSX.Element | null {
  if (summary.total === 0) return null;
  const totalsLabel = `${summary.mastered} of ${summary.total} mastered`;
  return (
    <div className="hb-mastery-summary">
      <div className="hb-mastery-summary-totals">
        <span className="t-pixel hb-mastery-summary-kicker">Progress</span>
        <strong className="hb-mastery-summary-headline">{totalsLabel}</strong>
        <span className="hb-mastery-summary-chips">
          <SummaryChip kind="inProgress" count={summary.inProgress} />
          <SummaryChip kind="skipped" count={summary.skipped} />
          <SummaryChip kind="notStarted" count={summary.notStarted} />
        </span>
      </div>
      {summary.areas.length > 1 ? (
        <ul className="hb-mastery-summary-areas">
          {summary.areas.map((area) => (
            <li key={area.area} className="hb-mastery-summary-area">
              <span className="t-pixel hb-mastery-summary-area-name">{AREA_LABEL[area.area]}</span>
              <AreaProgressBar area={area} />
              <span className="hb-mastery-summary-area-count">
                {area.mastered}/{area.total}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const CHIP_LABEL: Record<"inProgress" | "skipped" | "notStarted", string> = {
  inProgress: "in progress",
  skipped: "skipped",
  notStarted: "not started",
};

function SummaryChip({
  kind,
  count,
}: {
  kind: "inProgress" | "skipped" | "notStarted";
  count: number;
}): JSX.Element | null {
  if (count === 0) return null;
  return (
    <span className={`hb-mastery-summary-chip hb-mastery-summary-chip-${kind}`}>
      {count} {CHIP_LABEL[kind]}
    </span>
  );
}

function AreaProgressBar({ area }: { area: MasteryAreaSummary }): JSX.Element {
  const masteredPct = area.total > 0 ? (area.mastered / area.total) * 100 : 0;
  const inProgressPct = area.total > 0 ? (area.inProgress / area.total) * 100 : 0;
  const skippedPct = area.total > 0 ? (area.skipped / area.total) * 100 : 0;
  return (
    <span
      className="hb-mastery-summary-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={area.total}
      aria-valuenow={area.mastered}
      aria-label={`${area.mastered} of ${area.total} KPs mastered in ${AREA_LABEL[area.area]}`}
    >
      <span className="hb-mastery-summary-bar-mastered" style={{ width: `${masteredPct}%` }} />
      <span className="hb-mastery-summary-bar-in-progress" style={{ width: `${inProgressPct}%` }} />
      <span className="hb-mastery-summary-bar-skipped" style={{ width: `${skippedPct}%` }} />
    </span>
  );
}

function groupByArea(nodes: KnowledgePoint[]): Map<KnowledgePointArea, KnowledgePoint[]> {
  const grouped = new Map<KnowledgePointArea, KnowledgePoint[]>();
  for (const area of KP_AREAS) grouped.set(area, []);
  for (const node of nodes) {
    const bucket = grouped.get(node.area);
    if (bucket) bucket.push(node);
  }
  return grouped;
}

export function ParentMasteryGrid({ graph, progress }: ParentMasteryGridProps): JSX.Element {
  const updateStatus = useProgressStore((s) => s.updateStatus);
  const setSkipped = useProgressStore((s) => s.setSkipped);
  const updateError = useProgressStore((s) => s.updateError);
  const [filter, setFilter] = useState<MasteryFilter>("all");
  const [areaFilter, setAreaFilter] = useState<MasteryAreaFilter>("all");
  const [query, setQuery] = useState<string>("");

  const filteredNodes = useMemo(
    () =>
      searchKpsByText(
        filterKpsByArea(filterKpsByMasteryStatus(graph?.nodes ?? [], progress, filter), areaFilter),
        query,
      ),
    [graph, progress, filter, areaFilter, query],
  );
  const areaFilterCounts = useMemo(() => countKpsByAreaFilter(graph?.nodes ?? []), [graph]);

  if (!graph || graph.nodes.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Mastery</h2>
        <p className="hb-parent-empty">No knowledge points loaded yet.</p>
      </section>
    );
  }

  const grouped = groupByArea(filteredNodes);
  const statuses = progress?.knowledgePoints ?? {};
  const summary = computeMasterySummary(graph, progress);
  const filterCounts = countMasteryFilterMatches(summary);

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Mastery</h2>
      <p className="hb-mastery-hint">
        Click a pill to cycle mastery: off &rarr; saw &rarr; help &rarr; solo &rarr; explained. Use
        Skip for KPs the kid already knows from elsewhere.
      </p>
      <MasterySummaryPanel summary={summary} />
      <div className="hb-mastery-search">
        <label className="hb-mastery-search-label t-pixel" htmlFor="hb-mastery-search-input">
          Search
        </label>
        <input
          id="hb-mastery-search-input"
          type="search"
          className="hb-mastery-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a KP by name, id, or area..."
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-mastery-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>
      <fieldset className="hb-mastery-filter">
        <legend className="hb-mastery-filter-legend t-pixel">Show</legend>
        {MASTERY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="hb-mastery-filter-chip t-pixel"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            <span className="hb-mastery-filter-chip-label">{MASTERY_FILTER_LABELS[f]}</span>
            <span className="hb-mastery-filter-chip-count">{filterCounts[f]}</span>
          </button>
        ))}
      </fieldset>
      <fieldset className="hb-mastery-area-filter">
        <legend className="hb-mastery-area-filter-legend t-pixel">Area</legend>
        {MASTERY_AREA_FILTERS.map((a) => (
          <button
            key={a}
            type="button"
            className="hb-mastery-area-filter-chip t-pixel"
            aria-pressed={areaFilter === a}
            onClick={() => setAreaFilter(a)}
          >
            <span className="hb-mastery-area-filter-chip-label">
              {MASTERY_AREA_FILTER_LABELS[a]}
            </span>
            <span className="hb-mastery-area-filter-chip-count">{areaFilterCounts[a]}</span>
          </button>
        ))}
      </fieldset>
      {updateError ? <p className="hb-mastery-error">{updateError}</p> : null}
      {filteredNodes.length === 0 ? (
        <p className="hb-mastery-filter-empty">
          {query.trim().length > 0
            ? areaFilter === "all"
              ? `No KPs match "${query.trim()}".`
              : `No ${MASTERY_AREA_FILTER_LABELS[areaFilter]} KPs match "${query.trim()}".`
            : areaFilter === "all"
              ? `No KPs are ${MASTERY_FILTER_LABELS[filter]} right now.`
              : `No ${MASTERY_AREA_FILTER_LABELS[areaFilter]} KPs are ${MASTERY_FILTER_LABELS[filter]} right now.`}
        </p>
      ) : null}
      <div className="hb-mastery-grid">
        {KP_AREAS.map((area) => {
          const nodes = grouped.get(area) ?? [];
          if (nodes.length === 0) return null;
          return (
            <div key={area} className={`hb-mastery-area hb-mastery-area-${area}`}>
              <h3 className="t-pixel hb-mastery-area-title">{AREA_LABEL[area]}</h3>
              <ul className="hb-mastery-list">
                {nodes.map((kp) => {
                  const status = statuses[kp.id]?.status;
                  const cls = status
                    ? `hb-mastery-pill hb-mastery-${status}`
                    : "hb-mastery-pill hb-mastery-not-started";
                  const label = status ? STATUS_LABEL[status] : "Not started";
                  const skip = describeKpSkip(progress, kp.id, kp.title_parent);
                  const rowCls = skip.skipped
                    ? "hb-mastery-row hb-mastery-row-skipped"
                    : "hb-mastery-row";
                  const skipCls = skip.skipped
                    ? "hb-mastery-skip hb-mastery-skip-on"
                    : "hb-mastery-skip";
                  const updated = describeKpMasteryUpdated(progress, kp.id);
                  const firstSeen = describeKpMasteryFirstSeen(progress, kp.id);
                  const evidence = describeKpMasteryEvidence(progress, kp.id);
                  const introduces = describeKpIntroduces(kp);
                  const prereqs = describeKpPrereqs(kp, graph, progress);
                  return (
                    <li key={kp.id} className={rowCls}>
                      <span className="hb-mastery-title">{kp.title_parent}</span>
                      {firstSeen ? (
                        <span
                          className="hb-mastery-first-seen t-pixel"
                          title={`First seen ${firstSeen.firstSeenAt}`}
                        >
                          Seen {firstSeen.relative}
                        </span>
                      ) : null}
                      {updated ? (
                        <span
                          className="hb-mastery-updated t-pixel"
                          title={`Last updated ${updated.updatedAt}`}
                        >
                          {updated.relative}
                        </span>
                      ) : null}
                      <div className="hb-mastery-actions">
                        <button
                          type="button"
                          className={cls}
                          onClick={() => void updateStatus(kp.id, nextStatus(status))}
                          aria-label={`Mastery for ${kp.title_parent}: ${label}. Click to cycle.`}
                        >
                          {label}
                        </button>
                        <button
                          type="button"
                          className={skipCls}
                          aria-pressed={skip.skipped}
                          aria-label={skip.ariaLabel}
                          onClick={() => void setSkipped(kp.id, skip.nextSkipped)}
                        >
                          {skip.label}
                        </button>
                      </div>
                      {evidence ? (
                        <p className="hb-mastery-evidence" title={evidence.text}>
                          <span className="t-pixel hb-mastery-evidence-kicker">Evidence</span>
                          <span className="hb-mastery-evidence-text">{evidence.preview}</span>
                        </p>
                      ) : null}
                      {introduces ? (
                        <p
                          className="hb-mastery-introduces"
                          title={`Teaches: ${introduces.join(", ")}`}
                        >
                          <span className="t-pixel hb-mastery-introduces-kicker">Teaches</span>
                          <span className="hb-mastery-introduces-tags">
                            {introduces.map((tag) => (
                              <span key={tag} className="hb-mastery-introduces-tag t-pixel">
                                {tag}
                              </span>
                            ))}
                          </span>
                        </p>
                      ) : null}
                      {prereqs ? (
                        <p
                          className="hb-mastery-prereqs"
                          title={`Needs: ${prereqs.map((p) => p.title).join(", ")}`}
                        >
                          <span className="t-pixel hb-mastery-prereqs-kicker">Needs</span>
                          <span className="hb-mastery-prereqs-tags">
                            {prereqs.map((prereq) => (
                              <span
                                key={prereq.id}
                                className={`hb-mastery-prereqs-tag hb-mastery-prereqs-tag-${prereq.state} t-pixel`}
                                title={prereq.known ? prereq.title : `${prereq.id} (orphan)`}
                              >
                                {prereq.title}
                              </span>
                            ))}
                          </span>
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
