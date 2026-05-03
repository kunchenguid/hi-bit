import mascotAvatarUrl from "@design/assets/logo-mark.svg";
import type { Dream, DreamCategory } from "@shared/dreams";
import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
import { formatDreamCardTitle } from "./dreamCardTitle";
import { type DreamCurrentMarker, describeDreamCurrentMarker } from "./dreamCurrentMarker";
import {
  countDreamsByCategoryFilter,
  DREAM_FILTERS,
  type DreamFilter,
  filterDreamsByCategory,
} from "./dreamFilter";
import {
  describeGreatFirstDream,
  type GreatFirstDreamMarker,
  isFirstDreamPicker,
  pickGreatFirstDreamIds,
} from "./dreamFirstDream";
import { type DreamInterestMatch, describeDreamInterestMatch } from "./dreamInterestMatch";
import { scoreDreamInterestMatch } from "./dreamInterestScore";
import {
  describeRecommendedDream,
  pickRecommendedDreamIds,
  type RecommendedDreamMarker,
} from "./dreamPickedForYou";
import {
  isDreamPickerCollapsible,
  mergeRecommendedDreamIds,
  pickFallbackRecommendedIds,
} from "./dreamPickerCollapse";
import { computeDreamReadiness, describeDreamReadiness } from "./dreamReadiness";
import { type DreamRequiresWarning, describeDreamRequiresWarning } from "./dreamRequiresWarning";
import { searchDreamsByText } from "./dreamSearch";
import { type DreamTriedBeforeMarker, describeDreamTriedBefore } from "./dreamTriedBefore";

const CATEGORY_LABELS: Record<DreamCategory, string> = {
  arcade: "arcade",
  creative: "creative",
  personal: "personal",
  utility: "utility",
  art: "art",
};

const FILTER_LABELS: Record<DreamFilter, string> = {
  all: "all",
  ...CATEGORY_LABELS,
};

const DIFFICULTY_LABELS: Record<Dream["difficulty"], string> = {
  1: "1 bit",
  2: "2 bits",
  3: "3 bits",
  4: "4 bits",
  5: "5 bits",
};

type Props = {
  profile: Profile;
  onCancel?: () => void;
  onPicked?: () => void;
};

export function DreamPicker({ profile, onCancel, onPicked }: Props): JSX.Element {
  const status = useGraphStore((s) => s.status);
  const error = useGraphStore((s) => s.error);
  const library = useGraphStore((s) => s.library);
  const graph = useGraphStore((s) => s.graph);
  const load = useGraphStore((s) => s.load);
  const setCurrentDream = useProfileStore((s) => s.setCurrentDream);
  const progress = useProgressStore((s) => s.progress);
  const loadedProgressProfileId = useProgressStore((s) => s.profileId);
  const loadProgress = useProgressStore((s) => s.load);

  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DreamFilter>("all");
  const [query, setQuery] = useState<string>("");
  const [showAllDreams, setShowAllDreams] = useState<boolean>(false);

  useEffect(() => {
    if (status === "idle") {
      void load();
    }
  }, [status, load]);

  useEffect(() => {
    if (loadedProgressProfileId !== profile.id) void loadProgress(profile.id);
  }, [profile.id, loadedProgressProfileId, loadProgress]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape" || picking !== null) return;
      if (query.length > 0) {
        e.preventDefault();
        setQuery("");
        return;
      }
      if (onCancel) {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [picking, onCancel, query]);

  const isFirstTimer = useMemo(() => isFirstDreamPicker(progress), [progress]);

  const greatFirstDreamIds = useMemo<Set<string>>(
    () => (library ? pickGreatFirstDreamIds(library.dreams) : new Set<string>()),
    [library],
  );

  const recommendedDreamIds = useMemo<Set<string>>(
    () =>
      library
        ? pickRecommendedDreamIds(library.dreams, profile.interests, isFirstTimer)
        : new Set<string>(),
    [library, profile.interests, isFirstTimer],
  );

  const allDreams = useMemo<Dream[]>(() => {
    if (!library) return [];
    const matchScore = (d: Dream) => scoreDreamInterestMatch(d, profile.interests);
    const greatFirst = (d: Dream) => (isFirstTimer && greatFirstDreamIds.has(d.id) ? 1 : 0);
    return [...library.dreams].sort((a, b) => {
      const byGreatFirst = greatFirst(b) - greatFirst(a);
      if (byGreatFirst !== 0) return byGreatFirst;
      if (greatFirst(a) > 0 && greatFirst(b) > 0) {
        const byDifficulty = a.difficulty - b.difficulty;
        if (byDifficulty !== 0) return byDifficulty;
        const byRequiredCount = a.requires.length - b.requires.length;
        if (byRequiredCount !== 0) return byRequiredCount;
      }
      return matchScore(b) - matchScore(a);
    });
  }, [library, profile.interests, isFirstTimer, greatFirstDreamIds]);

  const fallbackDreamIds = useMemo<Set<string>>(
    () =>
      pickFallbackRecommendedIds({
        isFirstTimer,
        recommendedDreamIds,
        greatFirstDreamIds,
      }),
    [isFirstTimer, recommendedDreamIds, greatFirstDreamIds],
  );

  const collapseRecommendedIds = useMemo<Set<string>>(
    () =>
      mergeRecommendedDreamIds(
        isFirstTimer ? greatFirstDreamIds : fallbackDreamIds,
        recommendedDreamIds,
      ),
    [isFirstTimer, greatFirstDreamIds, fallbackDreamIds, recommendedDreamIds],
  );

  const collapsible = useMemo(
    () =>
      isDreamPickerCollapsible({
        filter,
        query,
        recommendedDreamIds: collapseRecommendedIds,
      }),
    [filter, query, collapseRecommendedIds],
  );

  const collapsed = collapsible && !showAllDreams;

  const dreams = useMemo<Dream[]>(() => {
    const filtered = searchDreamsByText(filterDreamsByCategory(allDreams, filter), query);
    if (!collapsed) return filtered;
    return filtered.filter((d) => collapseRecommendedIds.has(d.id));
  }, [allDreams, filter, query, collapsed, collapseRecommendedIds]);

  const collapsedHiddenCount = collapsible ? allDreams.length - collapseRecommendedIds.size : 0;

  const filterCounts = useMemo(() => countDreamsByCategoryFilter(allDreams), [allDreams]);

  if (status === "idle" || status === "loading") {
    return (
      <main className="hb-gate">
        <p className="hb-gate-loading">Loading dreams...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <h1>Can't reach the dream library.</h1>
          <p className="hb-gate-sub">{error ?? "Try again in a moment."}</p>
          <button type="button" className="hb-btn hb-btn-primary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (allDreams.length === 0) {
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <h1>No dreams yet.</h1>
          <p className="hb-gate-sub">
            Once the dream library is seeded, pick a project and Bit will help you build it.
          </p>
        </div>
      </main>
    );
  }

  async function pick(dreamId: string): Promise<void> {
    setPicking(dreamId);
    setPickError(null);
    try {
      await setCurrentDream(profile.id, dreamId);
      onPicked?.();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Couldn't save your pick.");
      setPicking(null);
    }
  }

  return (
    <main className="hb-gate hb-dream-shell">
      <div className="hb-dream-card">
        <div className="hb-dream-heading">
          <div>
            <div className="t-pixel hb-gate-kicker">Pick your dream</div>
            <h1>What do you want to build, {profile.name}?</h1>
            <p className="hb-gate-sub">
              Each dream is a real web project. Bit will teach you what you need as you go.
            </p>
          </div>
          {onCancel ? (
            <button
              type="button"
              className="hb-btn hb-btn-ghost"
              onClick={onCancel}
              disabled={picking !== null}
            >
              Keep current dream
            </button>
          ) : null}
        </div>

        {pickError ? <p className="hb-form-err">{pickError}</p> : null}

        <div className="hb-dream-search">
          <label className="hb-dream-search-label t-pixel" htmlFor="hb-dream-search-input">
            Search
          </label>
          <input
            id="hb-dream-search-input"
            type="search"
            className="hb-dream-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to find a dream..."
            disabled={picking !== null}
          />
          {query.length > 0 ? (
            <button
              type="button"
              className="hb-btn hb-btn-ghost hb-dream-search-clear"
              onClick={() => setQuery("")}
              disabled={picking !== null}
            >
              Clear
            </button>
          ) : null}
        </div>

        <fieldset className="hb-dream-filter">
          <legend className="hb-dream-filter-legend t-pixel">Browse by</legend>
          {DREAM_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="hb-dream-filter-chip t-pixel"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              disabled={picking !== null}
            >
              <span className="hb-dream-filter-chip-label">{FILTER_LABELS[f]}</span>
              <span className="hb-dream-filter-chip-count">({filterCounts[f]})</span>
            </button>
          ))}
        </fieldset>

        {collapsible ? (
          <p className="hb-dream-collapse-hint">
            {collapsed
              ? `Here are the ${dreams.length} dreams Bit picked for you. Want to see the rest?`
              : `Showing all ${allDreams.length} dreams. Bit picked some just for you above.`}
          </p>
        ) : null}

        {dreams.length === 0 ? (
          <p className="hb-dream-filter-empty">
            {query.trim().length > 0
              ? `Nothing matches "${query.trim()}" in ${FILTER_LABELS[filter]}. Try another word or category.`
              : `Nothing in ${FILTER_LABELS[filter]} yet. Try another category.`}
          </p>
        ) : (
          <ul className="hb-dream-list">
            {dreams.map((dream) => {
              const readiness = computeDreamReadiness(dream, graph, progress);
              const interestMatch = describeDreamInterestMatch(dream, profile.interests);
              const requiresWarning = describeDreamRequiresWarning(readiness);
              const currentMarker = describeDreamCurrentMarker(dream.id, profile.currentDreamId);
              const triedBefore = describeDreamTriedBefore(
                dream.id,
                profile.dreamHistory,
                profile.currentDreamId,
              );
              const greatFirstDream =
                isFirstTimer && greatFirstDreamIds.has(dream.id) ? describeGreatFirstDream() : null;
              const recommendedDream = recommendedDreamIds.has(dream.id)
                ? describeRecommendedDream()
                : null;
              return (
                <li key={dream.id}>
                  <DreamCard
                    dream={dream}
                    readinessLabel={describeDreamReadiness(readiness)}
                    readinessReady={readiness.allReady}
                    interestMatch={interestMatch}
                    requiresWarning={requiresWarning}
                    currentMarker={currentMarker}
                    triedBefore={triedBefore}
                    greatFirstDream={greatFirstDream}
                    recommendedDream={recommendedDream}
                    disabled={picking !== null}
                    pending={picking === dream.id}
                    onPick={() => void pick(dream.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {collapsible ? (
          <div className="hb-dream-collapse-toggle-row">
            <button
              type="button"
              className="hb-btn hb-btn-ghost hb-dream-collapse-toggle"
              onClick={() => setShowAllDreams((v) => !v)}
              disabled={picking !== null}
            >
              {collapsed
                ? `Show all ${allDreams.length} dreams (${collapsedHiddenCount} more)`
                : "Back to my picks"}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function DreamCard({
  dream,
  readinessLabel,
  readinessReady,
  interestMatch,
  requiresWarning,
  currentMarker,
  triedBefore,
  greatFirstDream,
  recommendedDream,
  disabled,
  pending,
  onPick,
}: {
  dream: Dream;
  readinessLabel: string;
  readinessReady: boolean;
  interestMatch: DreamInterestMatch | null;
  requiresWarning: DreamRequiresWarning | null;
  currentMarker: DreamCurrentMarker | null;
  triedBefore: DreamTriedBeforeMarker | null;
  greatFirstDream: GreatFirstDreamMarker | null;
  recommendedDream: RecommendedDreamMarker | null;
  disabled: boolean;
  pending: boolean;
  onPick: () => void;
}): JSX.Element {
  const difficultyBits = [1, 2, 3, 4, 5].slice(0, dream.difficulty);

  return (
    <button
      type="button"
      className={`hb-dream-choice${currentMarker ? " hb-dream-choice-current" : ""}${
        greatFirstDream ? " hb-dream-choice-great-first" : ""
      }${recommendedDream ? " hb-dream-choice-picked-for-you" : ""}`}
      onClick={onPick}
      disabled={disabled}
    >
      <span className="hb-dream-emoji" aria-hidden="true">
        {dream.emoji}
      </span>
      <span className="hb-dream-text">
        <span className="hb-dream-title">{formatDreamCardTitle(dream.title_kid)}</span>
        <span className="hb-dream-summary">{dream.summary_kid}</span>
        <span className="hb-dream-tags">
          {greatFirstDream ? (
            <span className="hb-dream-great-first">
              <span className="hb-dream-great-first-kicker">{greatFirstDream.kicker}</span>
              <span className="hb-dream-great-first-text">{greatFirstDream.text}</span>
            </span>
          ) : null}
          {recommendedDream ? (
            <span className="hb-dream-picked-for-you">
              <span className="hb-dream-picked-for-you-kicker">{recommendedDream.kicker}</span>
              <span className="hb-dream-picked-for-you-text">{recommendedDream.text}</span>
            </span>
          ) : null}
          {dream.categories.map((c) => (
            <span key={c} className="hb-dream-tag">
              {CATEGORY_LABELS[c]}
            </span>
          ))}
          <span className="hb-dream-difficulty t-pixel">
            <span className="hb-dream-difficulty-icons" aria-hidden="true">
              {difficultyBits.map((level) => (
                <img
                  key={`bit-${level}`}
                  className="hb-dream-difficulty-icon"
                  src={mascotAvatarUrl}
                  alt=""
                  aria-hidden="true"
                />
              ))}
            </span>
            <span className="hb-dream-difficulty-label">{DIFFICULTY_LABELS[dream.difficulty]}</span>
          </span>
          <span className={`hb-dream-ready${readinessReady ? " hb-dream-ready-all" : ""} t-pixel`}>
            {readinessLabel}
          </span>
          {currentMarker ? (
            <span className="hb-dream-current t-pixel">
              <span className="hb-dream-current-kicker">{currentMarker.kicker}</span>
              <span className="hb-dream-current-text">{currentMarker.text}</span>
            </span>
          ) : null}
          {triedBefore ? (
            <span className="hb-dream-tried t-pixel">
              <span className="hb-dream-tried-kicker">{triedBefore.kicker}</span>
              <span className="hb-dream-tried-text">{triedBefore.text}</span>
            </span>
          ) : null}
          {interestMatch ? (
            <span className="hb-dream-interest t-pixel">
              <span className="hb-dream-interest-kicker">{interestMatch.kicker}</span>
              <span className="hb-dream-interest-tags">{interestMatch.tags.join(", ")}</span>
            </span>
          ) : null}
          {requiresWarning ? (
            <span className="hb-dream-warning t-pixel">
              <span className="hb-dream-warning-kicker">{requiresWarning.kicker}</span>
              <span className="hb-dream-warning-text">{requiresWarning.text}</span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="hb-dream-cta t-pixel">{pending ? "Picking..." : "Pick this"}</span>
    </button>
  );
}
