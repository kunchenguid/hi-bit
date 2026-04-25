import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useMemo } from "react";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
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
};

export function ParentHome({ profile, onLock }: ParentHomeProps): JSX.Element {
  const graph = useGraphStore((s) => s.graph);
  const library = useGraphStore((s) => s.library);
  const graphStatus = useGraphStore((s) => s.status);
  const loadGraph = useGraphStore((s) => s.load);

  const progress = useProgressStore((s) => s.progress);
  const progressStatus = useProgressStore((s) => s.status);
  const loadedProfileId = useProgressStore((s) => s.profileId);
  const loadProgress = useProgressStore((s) => s.load);

  const selectProfile = useProfileStore((s) => s.selectProfile);

  useEffect(() => {
    if (graphStatus === "idle") void loadGraph();
  }, [graphStatus, loadGraph]);

  useEffect(() => {
    if (loadedProfileId !== profile.id) void loadProgress(profile.id);
  }, [profile.id, loadedProfileId, loadProgress]);

  const dream = useMemo(() => {
    if (!library || !profile.currentDreamId) return null;
    return library.byId[profile.currentDreamId] ?? null;
  }, [library, profile.currentDreamId]);

  return (
    <main className="hb-parent-shell">
      <header className="hb-parent-header">
        <div className="hb-parent-heading">
          <div className="t-pixel hb-gate-kicker">Parent mode</div>
          <h1 className="hb-parent-title">{profile.name}'s Hi Bit</h1>
        </div>
        <div className="hb-parent-header-actions">
          <button type="button" className="hb-btn hb-btn-ghost" onClick={() => selectProfile(null)}>
            Switch profile
          </button>
          <button type="button" className="hb-btn hb-btn-ghost" onClick={onLock}>
            Lock parent mode
          </button>
        </div>
      </header>

      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Profile</h2>
        <dl className="hb-parent-dl">
          <div>
            <dt className="t-pixel hb-parent-dt">Name</dt>
            <dd>{profile.name}</dd>
          </div>
          <div>
            <dt className="t-pixel hb-parent-dt">Age</dt>
            <dd>{profile.age}</dd>
          </div>
          <div>
            <dt className="t-pixel hb-parent-dt">Interests</dt>
            <dd>{profile.interests.length > 0 ? profile.interests.join(", ") : "Not set"}</dd>
          </div>
          <div>
            <dt className="t-pixel hb-parent-dt">Current dream</dt>
            <dd>{dream ? dream.title_parent : (profile.currentDreamId ?? "None picked yet")}</dd>
          </div>
        </dl>
      </section>

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

      <ParentSettings profile={profile} />

      <ParentDirectivesOverview profileId={profile.id} parentSessionId={profile.sessions.parent} />

      <ParentChat
        profileId={profile.id}
        parentSessionId={profile.sessions.parent}
        kidName={profile.name}
      />

      <ParentProjectsReview
        profileId={profile.id}
        library={library}
        projects={progress?.projects ?? []}
        currentDreamId={profile.currentDreamId ?? null}
      />

      <ParentFlagsOverview profileId={profile.id} />

      <ParentSessionsOverview profileId={profile.id} targetMinutes={profile.sessionTargetMinutes} />

      <ParentAudit profileId={profile.id} />
    </main>
  );
}
