import mascotBooUrl from "@design/assets/mascot-boo.svg";
import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useState } from "react";
import { useProfileStore } from "../state/profileStore";
import { CreateProfileForm } from "./CreateProfileForm";

type View = "picker" | "create";

export function ProfileGate(): JSX.Element {
  const status = useProfileStore((s) => s.status);
  const error = useProfileStore((s) => s.error);
  const profiles = useProfileStore((s) => s.profiles);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const selectProfile = useProfileStore((s) => s.selectProfile);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);

  const [view, setView] = useState<View>("picker");

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (status === "ready" && profiles.length === 0) {
      setView("create");
    }
  }, [status, profiles.length]);

  if (status === "idle" || status === "loading") {
    return (
      <main className="hb-gate">
        <p className="hb-gate-loading">Waking Bit up...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <h1>Something went sideways.</h1>
          <p className="hb-gate-sub">{error ?? "Couldn't read the profile directory."}</p>
          <button
            type="button"
            className="hb-btn hb-btn-primary"
            onClick={() => void loadProfiles()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (activeProfileId) {
    const active = profiles.find((p) => p.id === activeProfileId);
    const dreamLine = active?.currentDreamId
      ? `Current dream: ${active.currentDreamId}.`
      : "No dream picked yet.";
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <div className="t-pixel hb-gate-kicker">Signed in</div>
          <h1>Hi, {active?.name ?? "friend"}.</h1>
          <p className="hb-gate-sub">{dreamLine} (Tutor chat ships in a future step.)</p>
          <button type="button" className="hb-btn hb-btn-ghost" onClick={() => selectProfile(null)}>
            Switch profile
          </button>
        </div>
      </main>
    );
  }

  if (view === "create") {
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <img
            className="hb-gate-mascot"
            src={mascotBooUrl}
            alt=""
            aria-hidden="true"
            width={120}
            height={120}
          />
          <div className="t-pixel hb-gate-kicker">
            {profiles.length === 0 ? "First time" : "New profile"}
          </div>
          <h1>{profiles.length === 0 ? "Who's using Hi Bit?" : "Add a new learner"}</h1>
          <p className="hb-gate-sub">
            Bit uses this to greet them by name and pick dreams they'd actually build.
          </p>
          <CreateProfileForm
            onCreated={(profileId) => {
              selectProfile(profileId);
              setView("picker");
            }}
            onCancel={profiles.length > 0 ? () => setView("picker") : undefined}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="hb-gate">
      <div className="hb-gate-card">
        <img
          className="hb-gate-mascot"
          src={mascotBooUrl}
          alt=""
          aria-hidden="true"
          width={120}
          height={120}
        />
        <div className="t-pixel hb-gate-kicker">Who's using Hi Bit?</div>
        <h1>Pick a profile.</h1>
        <ul className="hb-profile-list">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <ProfileChoice profile={profile} onPick={() => selectProfile(profile.id)} />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="hb-btn hb-btn-ghost hb-profile-add"
          onClick={() => setView("create")}
        >
          + Add a new learner
        </button>
      </div>
    </main>
  );
}

function ProfileChoice({ profile, onPick }: { profile: Profile; onPick: () => void }): JSX.Element {
  const initials = profile.name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  return (
    <button type="button" className="hb-profile-card" onClick={onPick}>
      <span className="hb-profile-avatar" aria-hidden="true">
        {initials || "?"}
      </span>
      <span className="hb-profile-text">
        <span className="hb-profile-name">{profile.name}</span>
        <span className="hb-profile-meta t-small">
          Age {profile.age}
          {profile.interests.length > 0 ? ` · ${profile.interests.slice(0, 3).join(", ")}` : ""}
        </span>
      </span>
    </button>
  );
}
