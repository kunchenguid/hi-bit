import type { ProfileInput, ProfileSummary } from "@shared/profile";
import { CreateProfileForm } from "./CreateProfileForm";

type ProfileGateProps = {
  profiles: ProfileSummary[];
  busy: boolean;
  error: string | null;
  onCreate: (input: ProfileInput) => Promise<void>;
  onSelect: (profile: ProfileSummary) => Promise<void>;
  onLogout: () => void;
};

export function ProfileGate({
  profiles,
  busy,
  error,
  onCreate,
  onSelect,
  onLogout,
}: ProfileGateProps) {
  const hasProfiles = profiles.length > 0;

  return (
    <main className="hb-shell hb-profile-shell">
      <section className="hb-card hb-profile-gate-card">
        <div className="hb-profile-gate-header">
          <div>
            <div className="hb-bit-badge">Bit</div>
            <p className="t-pixel">Who's using Hi-Bit?</p>
            <h1>{hasProfiles ? "Pick a profile." : "Create your first kid profile."}</h1>
            <p>
              Bit uses a kid profile to remember who is building, keep projects separate, and choose
              warmer age-appropriate words.
            </p>
          </div>
          <button className="hb-button hb-button-secondary" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>

        {error ? <p className="hb-error">{error}</p> : null}

        {hasProfiles ? (
          <section className="hb-profile-list" aria-label="Kid profiles">
            {profiles.map((profile) => (
              <button
                className="hb-profile-card"
                key={profile.id}
                type="button"
                onClick={() => void onSelect(profile)}
              >
                <span className="hb-profile-avatar" aria-hidden="true">
                  {initialsFor(profile.name)}
                </span>
                <span>
                  <strong>{profile.name}</strong>
                  <span>
                    Age {profile.age}
                    {profile.interests.length
                      ? ` - ${profile.interests.slice(0, 3).join(", ")}`
                      : ""}
                  </span>
                </span>
              </button>
            ))}
          </section>
        ) : null}

        <section className="hb-card hb-create-profile-card">
          <h2>{hasProfiles ? "Add another profile" : "Who's using Hi-Bit?"}</h2>
          <CreateProfileForm busy={busy} onCreate={onCreate} />
        </section>
      </section>
    </main>
  );
}

function initialsFor(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  return initials || "?";
}
