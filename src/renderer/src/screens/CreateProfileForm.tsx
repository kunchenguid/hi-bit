import type { ProfileInput } from "@shared/profile";
import { type FormEvent, type JSX, type KeyboardEvent, useId, useState } from "react";
import { useProfileStore } from "../state/profileStore";
import {
  type CreateProfileFieldErrors,
  isCreateProfileFormDirty,
  validateCreateProfileFields,
} from "./createProfileValidation";

type Props = {
  parentPin: string;
  onCreated: (profileId: string) => void;
  onCancel?: () => void;
};

export function CreateProfileForm({ parentPin, onCreated, onCancel }: Props): JSX.Element {
  const nameId = useId();
  const ageId = useId();
  const interestsId = useId();
  const notesId = useId();

  const createProfile = useProfileStore((s) => s.createProfile);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [interests, setInterests] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CreateProfileFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: keyof CreateProfileFieldErrors): void {
    setFieldErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const isDirty = isCreateProfileFormDirty({ name, age, interests, notes });

  function resetForm(): void {
    setName("");
    setAge("");
    setInterests("");
    setNotes("");
    setFieldErrors({});
    setSubmitError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key === "Escape" && !submitting) {
      if (onCancel) {
        event.preventDefault();
        onCancel();
      } else if (isDirty) {
        event.preventDefault();
        resetForm();
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errs = validateCreateProfileFields({ name, age });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const input: ProfileInput = {
      name: name.trim(),
      age: Number.parseInt(age, 10),
      interests: interests
        .split(",")
        .map((i) => i.trim())
        .filter((i) => i.length > 0),
      notes: notes.trim() || undefined,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const profile = await createProfile(input, parentPin);
      onCreated(profile.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save the profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="hb-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
      <div className="hb-field">
        <label className="hb-label" htmlFor={nameId}>
          Name
        </label>
        <input
          id={nameId}
          className="hb-input"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError("name");
          }}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? `${nameId}-err` : undefined}
          // biome-ignore lint/a11y/noAutofocus: primary input on the profile creation card
          autoFocus
        />
        {fieldErrors.name && (
          <p id={`${nameId}-err`} className="hb-field-err">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className="hb-field">
        <label className="hb-label" htmlFor={ageId}>
          Age
        </label>
        <input
          id={ageId}
          className="hb-input hb-input-age"
          type="number"
          inputMode="numeric"
          min={3}
          max={18}
          value={age}
          onChange={(e) => {
            setAge(e.target.value);
            clearFieldError("age");
          }}
          aria-invalid={Boolean(fieldErrors.age)}
          aria-describedby={fieldErrors.age ? `${ageId}-err` : undefined}
        />
        {fieldErrors.age && (
          <p id={`${ageId}-err`} className="hb-field-err">
            {fieldErrors.age}
          </p>
        )}
      </div>

      <div className="hb-field">
        <label className="hb-label" htmlFor={interestsId}>
          Interests
        </label>
        <input
          id={interestsId}
          className="hb-input"
          type="text"
          placeholder="cats, space, drawing"
          autoComplete="off"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
        />
        <p className="hb-field-hint">Comma-separated. Bit uses these to pick dreams.</p>
      </div>

      <div className="hb-field">
        <label className="hb-label" htmlFor={notesId}>
          Notes for Bit <span className="hb-field-optional">(optional)</span>
        </label>
        <textarea
          id={notesId}
          className="hb-textarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Already knows CSS colors. Gets frustrated fast."
        />
      </div>

      {submitError && <p className="hb-form-err">{submitError}</p>}

      <div className="hb-form-actions">
        {onCancel ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Back
          </button>
        ) : (
          <button
            type="button"
            className="hb-btn hb-btn-ghost"
            onClick={resetForm}
            disabled={submitting || !isDirty}
          >
            Start over
          </button>
        )}
        <button type="submit" className="hb-btn hb-btn-primary" disabled={submitting}>
          {submitting ? "Saving..." : "Create profile"}
        </button>
      </div>
    </form>
  );
}
