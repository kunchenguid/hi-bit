import type { ProfileInput } from "@shared/profile";
import { type FormEvent, useState } from "react";

type CreateProfileFormProps = {
  busy: boolean;
  onCreate: (input: ProfileInput) => Promise<void>;
};

export function CreateProfileForm({ busy, onCreate }: CreateProfileFormProps) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [interests, setInterests] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    const parsedAge = Number(age);
    if (!trimmedName) {
      setError("We need a name to greet you by.");
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 3 || parsedAge > 18) {
      setError("Age must be a whole number between 3 and 18.");
      return;
    }
    setError(null);
    await onCreate({
      name: trimmedName,
      age: parsedAge,
      interests: interests
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form className="hb-profile-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="profile-name">Kid name</label>
      <input
        id="profile-name"
        name="name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        placeholder="Ada"
        autoComplete="off"
      />
      <label htmlFor="profile-age">Age</label>
      <input
        id="profile-age"
        name="age"
        value={age}
        onChange={(event) => setAge(event.currentTarget.value)}
        type="number"
        min={3}
        max={18}
        inputMode="numeric"
      />
      <label htmlFor="profile-interests">Interests</label>
      <input
        id="profile-interests"
        name="interests"
        value={interests}
        onChange={(event) => setInterests(event.currentTarget.value)}
        placeholder="space, cats, drawing"
        autoComplete="off"
      />
      <label htmlFor="profile-notes">Notes for Bit</label>
      <textarea
        id="profile-notes"
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.currentTarget.value)}
        placeholder="Already knows CSS colors. Gets frustrated fast."
        rows={3}
      />
      {error ? <p className="hb-error">{error}</p> : null}
      <button className="hb-button hb-button-primary" type="submit" disabled={busy}>
        {busy ? "Saving" : "Create profile"}
      </button>
    </form>
  );
}
