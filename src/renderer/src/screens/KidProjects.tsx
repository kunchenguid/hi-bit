import type { DreamCategory } from "@shared/dreams";
import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
import { describeKidProjectProgress } from "./kidProjectProgress";
import {
  countKidProjectsByCategoryFilter,
  filterKidProjectsByCategory,
  KID_PROJECTS_FILTERS,
  type KidProjectsFilter,
} from "./kidProjectsFilter";
import { buildKidProjectList, type KidProjectListEntry } from "./kidProjectsList";
import { searchKidProjectsByText } from "./kidProjectsSearch";
import { describeKidRelativeTime } from "./relativeTime";

const CATEGORY_LABELS: Record<DreamCategory, string> = {
  arcade: "arcade",
  creative: "creative",
  personal: "personal",
  utility: "utility",
  art: "art",
};

const FILTER_LABELS: Record<KidProjectsFilter, string> = {
  all: "all",
  ...CATEGORY_LABELS,
};

type Props = {
  profile: Profile;
  onOpened: () => void;
};

export function KidProjects({ profile, onOpened }: Props): JSX.Element {
  const progress = useProgressStore((s) => s.progress);
  const status = useProgressStore((s) => s.status);
  const error = useProgressStore((s) => s.error);
  const loadedProfileId = useProgressStore((s) => s.profileId);
  const loadProgress = useProgressStore((s) => s.load);

  const library = useGraphStore((s) => s.library);
  const graph = useGraphStore((s) => s.graph);
  const graphStatus = useGraphStore((s) => s.status);
  const loadGraph = useGraphStore((s) => s.load);

  const setCurrentDream = useProfileStore((s) => s.setCurrentDream);

  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [filter, setFilter] = useState<KidProjectsFilter>("all");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    if (graphStatus === "idle") void loadGraph();
  }, [graphStatus, loadGraph]);

  useEffect(() => {
    if (loadedProfileId !== profile.id) void loadProgress(profile.id);
  }, [profile.id, loadedProfileId, loadProgress]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape" || opening !== null) return;
      if (query.length > 0) {
        e.preventDefault();
        setQuery("");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [opening, query]);

  const allEntries = useMemo<KidProjectListEntry[]>(
    () =>
      buildKidProjectList({
        projects: progress?.projects ?? [],
        library,
        currentDreamId: profile.currentDreamId ?? null,
      }),
    [progress, library, profile.currentDreamId],
  );

  const entries = useMemo<KidProjectListEntry[]>(
    () => searchKidProjectsByText(filterKidProjectsByCategory(allEntries, filter), query),
    [allEntries, filter, query],
  );

  const filterCounts = useMemo(() => countKidProjectsByCategoryFilter(allEntries), [allEntries]);

  async function open(entry: KidProjectListEntry): Promise<void> {
    setOpening(entry.dreamId);
    setOpenError(null);
    try {
      if (!entry.isCurrent) {
        await setCurrentDream(profile.id, entry.dreamId);
      }
      onOpened();
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Couldn't open that project.");
      setOpening(null);
    }
  }

  return (
    <main className="hb-gate hb-projects-shell">
      <div className="hb-projects-card">
        <div className="hb-projects-heading">
          <div>
            <div className="t-pixel hb-gate-kicker">My projects</div>
            <h1>Pick something to keep building, {profile.name}.</h1>
            <p className="hb-gate-sub">
              Every dream you start lives here. Open one to keep working on it.
            </p>
          </div>
        </div>

        {status === "loading" || status === "idle" ? (
          <p className="hb-gate-loading">Loading your projects...</p>
        ) : null}
        {status === "error" ? (
          <p className="hb-form-err">Couldn't load your projects: {error ?? "unknown error"}</p>
        ) : null}
        {openError ? <p className="hb-form-err">{openError}</p> : null}

        {status === "ready" && allEntries.length > 0 ? (
          <div className="hb-kid-projects-search">
            <label
              className="hb-kid-projects-search-label t-pixel"
              htmlFor="hb-kid-projects-search-input"
            >
              Search
            </label>
            <input
              id="hb-kid-projects-search-input"
              type="search"
              className="hb-kid-projects-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to find a project..."
              disabled={opening !== null}
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="hb-btn hb-btn-ghost hb-kid-projects-search-clear"
                onClick={() => setQuery("")}
                disabled={opening !== null}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {status === "ready" && allEntries.length > 0 ? (
          <fieldset className="hb-kid-projects-filter">
            <legend className="hb-kid-projects-filter-legend t-pixel">Browse by</legend>
            {KID_PROJECTS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="hb-kid-projects-filter-chip t-pixel"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                disabled={opening !== null}
              >
                <span className="hb-kid-projects-filter-chip-label">{FILTER_LABELS[f]}</span>
                <span className="hb-kid-projects-filter-chip-count">({filterCounts[f]})</span>
              </button>
            ))}
          </fieldset>
        ) : null}

        {status === "ready" && allEntries.length === 0 ? (
          <p className="hb-projects-empty">
            No saved projects yet. Pick a dream and Bit will get you started.
          </p>
        ) : null}

        {status === "ready" && allEntries.length > 0 && entries.length === 0 ? (
          <p className="hb-kid-projects-filter-empty">
            {query.trim().length > 0
              ? `Nothing matches "${query.trim()}" in ${FILTER_LABELS[filter]}. Try another word or category.`
              : `Nothing in ${FILTER_LABELS[filter]} yet. Try another category.`}
          </p>
        ) : null}

        {entries.length > 0 ? (
          <ul className="hb-kid-projects-list">
            {entries.map((entry) => {
              const when = describeKidRelativeTime(entry.lastActiveAt);
              const dream = library?.byId[entry.dreamId] ?? null;
              const skills = describeKidProjectProgress(dream, graph, progress);
              return (
                <li key={entry.dreamId}>
                  <button
                    type="button"
                    className="hb-kid-project-choice"
                    onClick={() => void open(entry)}
                    disabled={opening !== null}
                  >
                    <span className="hb-kid-project-text">
                      <span className="hb-kid-project-head">
                        <span className="hb-kid-project-title">{entry.title}</span>
                        {entry.isCurrent ? (
                          <span className="hb-kid-project-current t-pixel">Current</span>
                        ) : null}
                        {skills ? (
                          <span
                            className={`hb-kid-project-progress${skills.allReady ? " hb-kid-project-progress-ready" : ""} t-pixel`}
                          >
                            <span className="hb-kid-project-progress-kicker">{skills.kicker}</span>
                            <span className="hb-kid-project-progress-text">{skills.text}</span>
                          </span>
                        ) : null}
                        {when ? (
                          <span className="hb-kid-project-when t-pixel">last worked on {when}</span>
                        ) : null}
                      </span>
                      {entry.summary ? (
                        <span className="hb-kid-project-summary">{entry.summary}</span>
                      ) : null}
                      {entry.categories.length > 0 ? (
                        <span className="hb-kid-project-tags">
                          {entry.categories.map((c) => (
                            <span key={c} className="hb-kid-project-tag t-pixel">
                              {CATEGORY_LABELS[c]}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="hb-kid-project-cta t-pixel">
                      {opening === entry.dreamId ? "Opening..." : "Open"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
