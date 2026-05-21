import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { type FormEvent, useEffect, useState } from "react";

type ProjectPickerProps = {
  profile: ProfileSummary;
  projects: ProjectSummary[];
  busy: boolean;
  error: string | null;
  onCreate: (title: string) => Promise<void>;
  onOpen: (project: ProjectSummary) => void;
  onLogout: () => void;
  onSwitchProfile: () => void;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
};

export function ProjectPicker({
  profile,
  projects,
  busy,
  error,
  onCreate,
  onOpen,
  onLogout,
  onSwitchProfile,
  onUpdateProfile,
}: ProjectPickerProps) {
  const [title, setTitle] = useState("");

  return (
    <main className="hb-shell hb-picker-shell">
      <header className="hb-topbar">
        <div>
          <p className="t-pixel">{profile.name}'s Hi-Bit</p>
          <h1>What does {profile.name} want to build?</h1>
          <p className="t-small">
            Age {profile.age}
            {profile.interests.length ? ` - ${profile.interests.join(", ")}` : ""}
          </p>
        </div>
        <div className="hb-header-actions">
          <button className="hb-button hb-button-secondary" type="button" onClick={onSwitchProfile}>
            Switch profile
          </button>
          <button className="hb-button hb-button-secondary" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {error ? <p className="hb-error">{error}</p> : null}

      <ProfileSettingsCard profile={profile} busy={busy} onUpdateProfile={onUpdateProfile} />

      <section className="hb-card hb-new-project-card">
        <h2>New project</h2>
        <p className="t-small">
          Start with a tiny local web page. Bit can turn it into a game, tool, or experiment.
        </p>
        <form
          className="hb-new-project-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate(title).then(() => setTitle(""));
          }}
        >
          <label htmlFor="project-title">Project name</label>
          <input
            id="project-title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="Space garden"
          />
          <button className="hb-button hb-button-primary" type="submit" disabled={busy}>
            Create
          </button>
        </form>
      </section>

      <section className="hb-project-grid" aria-label="Projects">
        {projects.map((project) => (
          <button
            className="hb-project-card"
            key={project.id}
            type="button"
            onClick={() => onOpen(project)}
          >
            <span className="t-pixel">Project</span>
            <strong>{project.title}</strong>
            <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </section>
    </main>
  );
}

function ProfileSettingsCard({
  profile,
  busy,
  onUpdateProfile,
}: {
  profile: ProfileSummary;
  busy: boolean;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [interests, setInterests] = useState(profile.interests.join(", "));
  const [notes, setNotes] = useState(profile.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(profile.name);
    setAge(String(profile.age));
    setInterests(profile.interests.join(", "));
    setNotes(profile.notes ?? "");
  }, [profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 3 || parsedAge > 18) {
      setFormError("Age must be a whole number between 3 and 18.");
      return;
    }
    setFormError(null);
    await onUpdateProfile({
      name,
      age: parsedAge,
      interests: interests
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean),
      notes: notes.trim() || null,
    });
  }

  return (
    <details className="hb-card hb-profile-settings-card">
      <summary>Edit {profile.name}'s profile</summary>
      <form className="hb-profile-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="profile-settings-name">Kid name</label>
        <input
          id="profile-settings-name"
          name="profileName"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <label htmlFor="profile-settings-age">Age</label>
        <input
          id="profile-settings-age"
          name="profileAge"
          value={age}
          onChange={(event) => setAge(event.currentTarget.value)}
          type="number"
          min={3}
          max={18}
        />
        <label htmlFor="profile-settings-interests">Interests</label>
        <input
          id="profile-settings-interests"
          name="profileInterests"
          value={interests}
          onChange={(event) => setInterests(event.currentTarget.value)}
        />
        <label htmlFor="profile-settings-notes">Notes for Bit</label>
        <textarea
          id="profile-settings-notes"
          name="profileNotes"
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
          rows={3}
        />
        {formError ? <p className="hb-error">{formError}</p> : null}
        <button className="hb-button hb-button-secondary" type="submit" disabled={busy}>
          Save profile
        </button>
      </form>
    </details>
  );
}
