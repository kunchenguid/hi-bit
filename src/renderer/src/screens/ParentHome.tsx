import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useFlagStore } from "../state/flagStore";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
import { computeMasterySummary } from "./parent/masterySummary";
import { chooseNextSuggestion } from "./parent/nextKpSuggestion";
import { ParentAudit } from "./parent/ParentAudit";
import { ParentChat } from "./parent/ParentChat";
import { ParentDirectivesOverview } from "./parent/ParentDirectivesOverview";
import { ParentDreamHistory } from "./parent/ParentDreamHistory";
import { ParentFlagsOverview } from "./parent/ParentFlagsOverview";
import { ParentMasteryGrid } from "./parent/ParentMasteryGrid";
import { ParentNextKp } from "./parent/ParentNextKp";
import { ParentProjectsReview } from "./parent/ParentProjectsReview";
import { ParentSessionsOverview } from "./parent/ParentSessionsOverview";
import { ParentSettings } from "./parent/ParentSettings";

export type ParentHomeProps = {
  profile: Profile;
  onLock: () => void;
  onSwitchProfile?: () => void;
};

type ParentSection = "overview" | "learning" | "projects" | "guidance" | "activity" | "settings";

const PARENT_SECTIONS: { id: ParentSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "learning", label: "Learning" },
  { id: "projects", label: "Projects" },
  { id: "guidance", label: "Guidance" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

function formatProfileMeta(profile: Profile): string {
  const interests =
    profile.interests.length > 0 ? profile.interests.join(", ") : "no interests set";
  return `Age ${profile.age} · ${interests}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ParentHome({ profile, onLock, onSwitchProfile }: ParentHomeProps): JSX.Element {
  const [activeSection, setActiveSection] = useState<ParentSection>("overview");
  const graph = useGraphStore((s) => s.graph);
  const library = useGraphStore((s) => s.library);
  const graphStatus = useGraphStore((s) => s.status);
  const loadGraph = useGraphStore((s) => s.load);

  const progress = useProgressStore((s) => s.progress);
  const progressStatus = useProgressStore((s) => s.status);
  const loadedProfileId = useProgressStore((s) => s.profileId);
  const loadProgress = useProgressStore((s) => s.load);

  const flags = useFlagStore((s) => s.flags);
  const flagStatus = useFlagStore((s) => s.status);
  const loadedFlagProfileId = useFlagStore((s) => s.profileId);
  const loadFlags = useFlagStore((s) => s.load);

  const selectProfile = useProfileStore((s) => s.selectProfile);

  useEffect(() => {
    if (graphStatus === "idle") void loadGraph();
  }, [graphStatus, loadGraph]);

  useEffect(() => {
    if (loadedProfileId !== profile.id) void loadProgress(profile.id);
  }, [profile.id, loadedProfileId, loadProgress]);

  useEffect(() => {
    if (loadedFlagProfileId !== profile.id) void loadFlags(profile.id);
  }, [profile.id, loadedFlagProfileId, loadFlags]);

  const dream = useMemo(() => {
    if (!library || !profile.currentDreamId) return null;
    return library.byId[profile.currentDreamId] ?? null;
  }, [library, profile.currentDreamId]);

  const nextSuggestion = useMemo(() => {
    if (!progress) return null;
    return chooseNextSuggestion({
      graph,
      library,
      currentDreamId: profile.currentDreamId ?? null,
      progress,
    });
  }, [graph, library, profile.currentDreamId, progress]);

  const masterySummary = useMemo(() => computeMasterySummary(graph, progress), [graph, progress]);
  const projectCount = progress?.projects.length ?? 0;
  const flagCount = loadedFlagProfileId === profile.id ? flags.length : 0;
  const isCheckingFlags = flagStatus === "loading" || loadedFlagProfileId !== profile.id;
  const dreamLabel = dream ? dream.title_parent : (profile.currentDreamId ?? "No dream picked yet");
  const overviewSentence = dream
    ? `${profile.name} is working on ${dream.title_parent}.`
    : `${profile.name} has not picked a dream yet.`;

  let nextFocusLabel = "Loading progress...";
  if (nextSuggestion?.kind === "next-kp") nextFocusLabel = nextSuggestion.kp.title_parent;
  if (nextSuggestion?.kind === "all-done") nextFocusLabel = "This dream is shippable.";
  if (nextSuggestion?.kind === "freeform") nextFocusLabel = "Free build mode.";
  if (nextSuggestion?.kind === "no-dream") nextFocusLabel = "Pick a dream to set a learning path.";
  if (nextSuggestion?.kind === "unknown-dream") nextFocusLabel = "The current dream is missing.";
  if (nextSuggestion?.kind === "unresolved-prereqs")
    nextFocusLabel = "Some required skills are missing.";

  const attentionLabel = isCheckingFlags
    ? "Checking flagged messages..."
    : flagCount > 0
      ? `${formatCount(flagCount, "flagged message")} needs review.`
      : "No flagged messages need review.";
  const attentionCopy =
    flagCount > 0
      ? "Open Activity to inspect context or clear the flag."
      : "Activity still keeps session logs and transcript audit tools.";

  return (
    <main className="hb-parent-shell">
      <header className="hb-parent-header">
        <div className="hb-parent-heading">
          <div className="t-pixel hb-gate-kicker">Parent mode</div>
          <h1 className="hb-parent-title">{profile.name}'s Hi-Bit</h1>
          <p className="hb-parent-profile-meta">{formatProfileMeta(profile)}</p>
        </div>
        <div className="hb-parent-header-actions">
          <button
            type="button"
            className="hb-btn hb-btn-ghost"
            onClick={onSwitchProfile ?? (() => selectProfile(null))}
          >
            Switch profile
          </button>
          <button type="button" className="hb-btn hb-btn-ghost" onClick={onLock}>
            Lock parent mode
          </button>
        </div>
      </header>

      <nav className="hb-parent-tabs" aria-label="Parent sections">
        {PARENT_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className="hb-parent-tab"
            aria-pressed={activeSection === section.id}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {activeSection === "overview" ? (
        <section className="hb-parent-overview" aria-labelledby="hb-parent-overview-title">
          <div className="hb-parent-overview-hero">
            <div>
              <h2 id="hb-parent-overview-title" className="hb-parent-overview-title">
                {overviewSentence}
              </h2>
              <p className="hb-parent-overview-copy">
                {formatCount(projectCount, "saved project")} · {masterySummary.mastered} of{" "}
                {masterySummary.total} skills practiced with help or better.
              </p>
            </div>
          </div>

          <div className="hb-parent-overview-grid">
            <article className="hb-parent-overview-card">
              <span className="t-pixel hb-parent-overview-kicker">Current dream</span>
              <h3>{dreamLabel}</h3>
              <p>The project Bit is using to choose useful next steps.</p>
            </article>
            <article className="hb-parent-overview-card">
              <span className="t-pixel hb-parent-overview-kicker">Next learning step</span>
              <h3>{nextFocusLabel}</h3>
              <p>Open Learning when you want the full skill map.</p>
            </article>
            <article className="hb-parent-overview-card hb-parent-overview-card-attention">
              <span className="t-pixel hb-parent-overview-kicker">Needs attention</span>
              <h3>{attentionLabel}</h3>
              <p>{attentionCopy}</p>
            </article>
          </div>
        </section>
      ) : null}

      {activeSection === "learning" ? (
        <div className="hb-parent-section-stack">
          <ParentNextKp
            graph={graph}
            library={library}
            currentDreamId={profile.currentDreamId ?? null}
            progress={progress}
          />
          {progressStatus === "loading" ? (
            <section className="hb-parent-card">
              <h2 className="hb-parent-section-title">Mastery</h2>
              <p className="hb-parent-empty">Loading progress...</p>
            </section>
          ) : (
            <ParentMasteryGrid graph={graph} progress={progress} />
          )}
          <ParentDreamHistory
            dreamHistory={profile.dreamHistory}
            library={library}
            currentDreamId={profile.currentDreamId ?? null}
            graph={graph}
            progress={progress}
          />
        </div>
      ) : null}

      {activeSection === "projects" ? (
        <ParentProjectsReview
          profileId={profile.id}
          library={library}
          projects={progress?.projects ?? []}
          currentDreamId={profile.currentDreamId ?? null}
        />
      ) : null}

      {activeSection === "guidance" ? (
        <div className="hb-parent-section-stack">
          <ParentDirectivesOverview
            profileId={profile.id}
            parentSessionId={profile.sessions.parent}
          />
          <ParentChat
            profileId={profile.id}
            parentSessionId={profile.sessions.parent}
            kidName={profile.name}
          />
        </div>
      ) : null}

      {activeSection === "activity" ? (
        <div className="hb-parent-section-stack">
          <ParentFlagsOverview profileId={profile.id} />
          <ParentSessionsOverview
            profileId={profile.id}
            targetMinutes={profile.sessionTargetMinutes}
          />
          <ParentAudit profileId={profile.id} />
        </div>
      ) : null}

      {activeSection === "settings" ? <ParentSettings profile={profile} /> : null}
    </main>
  );
}
