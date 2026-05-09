import mascotBooUrl from "@design/assets/mascot-boo.svg";
import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useState } from "react";
import { useAppModeStore } from "../state/appModeStore";
import { useConfigStore } from "../state/configStore";
import { useProfileStore } from "../state/profileStore";
import { CreateProfileForm } from "./CreateProfileForm";
import { HarnessSetup } from "./HarnessSetup";
import { ParentGate } from "./ParentGate";
import { ParentHome } from "./ParentHome";

type ParentShellView = "gate" | "harness" | "picker" | "create" | "home";

export function ParentShell(): JSX.Element {
  const exitParent = useAppModeStore((s) => s.exitParent);
  const defaultAgent = useConfigStore((s) => s.config?.defaultAgent);
  const configStatus = useConfigStore((s) => s.status);
  const loadConfig = useConfigStore((s) => s.load);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const profileStatus = useProfileStore((s) => s.status);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);

  const [unlockedPin, setUnlockedPin] = useState<string | null>(null);
  const [managingProfileId, setManagingProfileId] = useState<string | null>(activeProfileId);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (configStatus === "idle") void loadConfig();
  }, [configStatus, loadConfig]);

  useEffect(() => {
    if (profileStatus === "idle") void loadProfiles();
  }, [profileStatus, loadProfiles]);

  const unlocked = unlockedPin !== null;
  const canExitParent = defaultAgent !== undefined && profiles.length > 0;

  let view: ParentShellView;
  if (!unlocked) {
    view = "gate";
  } else if (creating) {
    view = "create";
  } else if (profiles.length === 0) {
    view = "picker";
  } else if (!defaultAgent) {
    view = "harness";
  } else if (managingProfileId) {
    view = "home";
  } else {
    view = "picker";
  }

  if (view === "gate") {
    return (
      <ParentGate
        onUnlock={(pin) => setUnlockedPin(pin)}
        onCancel={canExitParent ? exitParent : undefined}
      />
    );
  }

  if (view === "harness") {
    return <HarnessSetup onDone={() => void loadConfig()} />;
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
            parentPin={unlockedPin ?? ""}
            onCreated={(profileId) => {
              setManagingProfileId(profileId);
              setCreating(false);
            }}
            onCancel={profiles.length > 0 ? () => setCreating(false) : undefined}
          />
        </div>
      </main>
    );
  }

  if (view === "picker") {
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
          <div className="t-pixel hb-gate-kicker">Parent mode</div>
          <h1>{profiles.length === 0 ? "Add your first learner." : "Pick a learner to manage."}</h1>
          <p className="hb-gate-sub">
            {profiles.length === 0
              ? "Create a profile so Bit can greet them by name and pick dreams to match."
              : "Open settings, progress, exports, and profile deletion behind the parent PIN."}
          </p>
          {profiles.length > 0 ? (
            <ul className="hb-profile-list">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <ParentProfileChoice
                    profile={profile}
                    onPick={() => setManagingProfileId(profile.id)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="hb-profile-actions">
            <button
              type="button"
              className="hb-btn hb-btn-ghost hb-profile-add"
              onClick={() => setCreating(true)}
            >
              + Add a new learner
            </button>
            {canExitParent ? (
              <button type="button" className="hb-btn hb-btn-ghost" onClick={exitParent}>
                Exit parent mode
              </button>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  // view === "home"
  const profile = profiles.find((p) => p.id === managingProfileId);
  if (!profile) {
    setManagingProfileId(null);
    return (
      <main className="hb-gate">
        <p className="hb-gate-loading">Loading parent mode...</p>
      </main>
    );
  }
  return (
    <ParentHome
      profile={profile}
      onSwitchProfile={() => setManagingProfileId(null)}
      onLock={exitParent}
    />
  );
}

function ParentProfileChoice({
  profile,
  onPick,
}: {
  profile: Profile;
  onPick: () => void;
}): JSX.Element {
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
      <span className="hb-profile-action t-pixel">Open parent mode</span>
    </button>
  );
}
