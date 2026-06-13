import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import { type FormEvent, useEffect, useState } from "react";
import { Icon } from "./Icon";

type ProfileSettingsMenuProps = {
  profile: ProfileSummary;
  busy: boolean;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
};

export function ProfileSettingsMenu({ profile, busy, onUpdateProfile }: ProfileSettingsMenuProps) {
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
    <form className="hb-profile-form hb-settings-profile-form" onSubmit={handleSubmit} noValidate>
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
      <button className="hb-button hb-button-primary" type="submit" disabled={busy}>
        <Icon name="i-check" />
        Save profile
      </button>
    </form>
  );
}
