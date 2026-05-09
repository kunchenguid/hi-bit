import mascotBooUrl from "@design/assets/mascot-boo.svg";
import type { Profile } from "@shared/profile";
import type { JSX } from "react";
import { useAppModeStore } from "../state/appModeStore";
import { useProfileStore } from "../state/profileStore";

export function ProfileGate(): JSX.Element {
  const status = useProfileStore((s) => s.status);
  const error = useProfileStore((s) => s.error);
  const profiles = useProfileStore((s) => s.profiles);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const selectProfile = useProfileStore((s) => s.selectProfile);
  const enterParent = useAppModeStore((s) => s.enterParent);

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
        <div className="hb-profile-actions">
          <button type="button" className="hb-btn hb-btn-ghost" onClick={enterParent}>
            For grown-ups
          </button>
        </div>
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
