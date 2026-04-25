import { DEFAULT_SESSION_TARGET_MINUTES, type Profile } from "@shared/profile";
import { type FormEvent, type JSX, type KeyboardEvent, useEffect, useState } from "react";
import { useConfigStore } from "../../state/configStore";
import { useProfileStore } from "../../state/profileStore";
import { buildThemeOptions } from "../../theme/themeOptions";
import { validateDeleteProfileConfirmation } from "./deleteProfileValidation";
import { describeExportResult, type ExportProfileResult } from "./exportProfileStatus";
import { validatePinChange } from "./pinValidation";

export type ParentSettingsProps = {
  profile: Profile;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";
type DeleteStatus = "idle" | "confirming" | "deleting" | "error";
type ExportStatus = "idle" | "exporting" | "done" | "error";
type ChangePinStatus = "idle" | "open" | "saving" | "saved" | "error";

export function ParentSettings({ profile }: ParentSettingsProps): JSX.Element {
  const updateSettings = useProfileStore((s) => s.updateSettings);
  const deleteProfile = useProfileStore((s) => s.deleteProfile);
  const exportProfile = useProfileStore((s) => s.exportProfile);
  const verifyParentPin = useConfigStore((s) => s.verifyParentPin);
  const setParentPin = useConfigStore((s) => s.setParentPin);
  const currentTheme = useConfigStore((s) => s.config?.theme);
  const setTheme = useConfigStore((s) => s.setTheme);
  const themeOptions = buildThemeOptions(currentTheme);
  const [themeError, setThemeError] = useState<string | null>(null);

  const [name, setName] = useState<string>(profile.name);
  const [age, setAge] = useState<string>(String(profile.age));
  const [minutes, setMinutes] = useState<string>(
    profile.sessionTargetMinutes !== undefined ? String(profile.sessionTargetMinutes) : "",
  );
  const [voice, setVoice] = useState<string>(profile.voicePreferences ?? "");
  const [notes, setNotes] = useState<string>(profile.notes ?? "");
  const [interests, setInterests] = useState<string>(profile.interests.join(", "));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteTyped, setDeleteTyped] = useState<string>("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportResult, setExportResult] = useState<ExportProfileResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pinStatus, setPinStatus] = useState<ChangePinStatus>("idle");
  const [currentPin, setCurrentPin] = useState<string>("");
  const [newPin, setNewPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    // Reset form fields when the underlying profile changes identity or saved values.
    void profile.id;
    setName(profile.name);
    setAge(String(profile.age));
    setMinutes(
      profile.sessionTargetMinutes !== undefined ? String(profile.sessionTargetMinutes) : "",
    );
    setVoice(profile.voicePreferences ?? "");
    setNotes(profile.notes ?? "");
    setInterests(profile.interests.join(", "));
    setStatus("idle");
    setError(null);
    setDeleteStatus("idle");
    setDeleteTyped("");
    setDeleteError(null);
    setExportStatus("idle");
    setExportResult(null);
    setExportError(null);
    setPinStatus("idle");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinError(null);
  }, [
    profile.id,
    profile.name,
    profile.age,
    profile.sessionTargetMinutes,
    profile.voicePreferences,
    profile.notes,
    profile.interests,
  ]);

  const placeholder = `${DEFAULT_SESSION_TARGET_MINUTES} (default)`;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setStatus("error");
      setError("Name must not be empty.");
      return;
    }
    const parsedAge = Number.parseInt(age, 10);
    if (!Number.isInteger(parsedAge) || parsedAge < 3 || parsedAge > 18) {
      setStatus("error");
      setError("Age must be a whole number between 3 and 18.");
      return;
    }
    const trimmedMinutes = minutes.trim();
    let minutesValue: number | null = null;
    if (trimmedMinutes.length > 0) {
      const parsed = Number(trimmedMinutes);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 240) {
        setStatus("error");
        setError("Session target must be a whole number of minutes between 1 and 240.");
        return;
      }
      minutesValue = parsed;
    }
    const trimmedVoice = voice.trim();
    const trimmedNotes = notes.trim();
    const parsedInterests = interests
      .split(",")
      .map((i) => i.trim())
      .filter((i) => i.length > 0);
    setStatus("saving");
    try {
      await updateSettings(profile.id, {
        name: trimmedName,
        age: parsedAge,
        sessionTargetMinutes: minutesValue,
        voicePreferences: trimmedVoice.length > 0 ? trimmedVoice : null,
        notes: trimmedNotes.length > 0 ? trimmedNotes : null,
        interests: parsedInterests,
      });
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    }
  }

  async function handleExport(): Promise<void> {
    setExportStatus("exporting");
    setExportError(null);
    setExportResult(null);
    try {
      const path = await exportProfile(profile.id);
      setExportResult(describeExportResult(path));
      setExportStatus("done");
    } catch (err) {
      setExportStatus("error");
      setExportError(err instanceof Error ? err.message : "Failed to export profile.");
    }
  }

  function resetPinForm(): void {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinError(null);
  }

  function cancelPinForm(): void {
    resetPinForm();
    setPinStatus("idle");
  }

  function handleChangePinKeyDown(e: KeyboardEvent<HTMLFormElement>): void {
    if (e.key === "Escape" && pinStatus !== "saving") {
      e.preventDefault();
      cancelPinForm();
    }
  }

  function cancelDeleteForm(): void {
    setDeleteStatus("idle");
    setDeleteTyped("");
    setDeleteError(null);
  }

  function handleDeleteKeyDown(e: KeyboardEvent<HTMLFormElement>): void {
    if (e.key === "Escape" && deleteStatus !== "deleting") {
      e.preventDefault();
      cancelDeleteForm();
    }
  }

  async function handleChangePin(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const validation = validatePinChange(currentPin, newPin, confirmPin);
    if (!validation.ok) {
      setPinStatus("error");
      setPinError(validation.error);
      return;
    }
    setPinStatus("saving");
    setPinError(null);
    try {
      const verified = await verifyParentPin(currentPin);
      if (!verified) {
        setPinStatus("error");
        setPinError("Current PIN is incorrect.");
        return;
      }
      await setParentPin(newPin);
      setPinStatus("saved");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      setPinStatus("error");
      setPinError(err instanceof Error ? err.message : "Failed to change PIN.");
    }
  }

  async function handleDelete(): Promise<void> {
    const validation = validateDeleteProfileConfirmation(profile.name, deleteTyped);
    if (!validation.ok) {
      setDeleteStatus("error");
      setDeleteError(validation.error);
      return;
    }
    setDeleteStatus("deleting");
    setDeleteError(null);
    try {
      await deleteProfile(profile.id);
      // On success, the store clears activeProfileId and App.tsx will route to ProfileGate.
      // This component will unmount, so no further state cleanup is needed here.
    } catch (err) {
      setDeleteStatus("error");
      setDeleteError(err instanceof Error ? err.message : "Failed to delete profile.");
    }
  }

  return (
    <section className="hb-parent-card hb-parent-settings">
      <h2 className="hb-parent-section-title">Settings</h2>
      <p className="hb-parent-settings-hint">
        Fix the name or age if you fat-fingered them at sign-up, and give Bit notes on how to speak
        with {profile.name} and what context to keep in mind.
      </p>
      <form className="hb-parent-settings-form" onSubmit={handleSubmit}>
        <label className="hb-parent-settings-field">
          <span className="t-pixel hb-parent-dt">Name</span>
          <input
            className="hb-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={status === "saving"}
            autoComplete="off"
          />
        </label>

        <label className="hb-parent-settings-field">
          <span className="t-pixel hb-parent-dt">Age</span>
          <input
            className="hb-input"
            type="number"
            inputMode="numeric"
            min={3}
            max={18}
            step={1}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            disabled={status === "saving"}
          />
        </label>

        <label className="hb-parent-settings-field">
          <span className="t-pixel hb-parent-dt">Session target (minutes)</span>
          <input
            className="hb-input"
            type="number"
            min={1}
            max={240}
            step={1}
            placeholder={placeholder}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            disabled={status === "saving"}
          />
        </label>

        <label className="hb-parent-settings-field">
          <span className="t-pixel hb-parent-dt">Interests (comma-separated)</span>
          <input
            className="hb-input"
            type="text"
            placeholder="e.g. cats, space, dinosaurs"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            disabled={status === "saving"}
          />
        </label>

        <label className="hb-parent-settings-field">
          <span className="t-pixel hb-parent-dt">Voice notes for Bit</span>
          <textarea
            className="hb-input hb-parent-settings-textarea"
            rows={3}
            placeholder="e.g. gentle, loves dinosaurs, avoids loud celebrations"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={status === "saving"}
          />
        </label>

        <label className="hb-parent-settings-field">
          <span className="t-pixel hb-parent-dt">Parent notes for Bit</span>
          <textarea
            className="hb-input hb-parent-settings-textarea"
            rows={3}
            placeholder={`Context about ${profile.name} that Bit should know (e.g. already knows CSS colors from school, gets frustrated fast, loves silly praise)`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={status === "saving"}
          />
        </label>

        <div className="hb-parent-settings-actions">
          <button type="submit" className="hb-btn hb-btn-primary" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : "Save settings"}
          </button>
          {status === "saved" ? <span className="hb-parent-settings-ok t-pixel">Saved</span> : null}
          {status === "error" && error ? (
            <span className="hb-parent-settings-error">{error}</span>
          ) : null}
        </div>
      </form>

      <div className="hb-parent-theme">
        <h3 className="t-pixel hb-parent-theme-title">Appearance</h3>
        <p className="hb-parent-theme-hint">
          Choose a theme for the app. System follows your computer's light or dark setting.
        </p>
        <fieldset className="hb-parent-theme-row">
          <legend className="t-pixel hb-parent-theme-legend">Theme</legend>
          {themeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className="hb-parent-theme-chip"
              aria-pressed={option.pressed}
              onClick={async () => {
                if (option.pressed) return;
                setThemeError(null);
                try {
                  await setTheme(option.theme);
                } catch (err) {
                  setThemeError(err instanceof Error ? err.message : "Failed to save theme.");
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
        {themeError ? <span className="hb-parent-settings-error">{themeError}</span> : null}
      </div>

      <div className="hb-parent-export">
        <h3 className="t-pixel hb-parent-export-title">Export</h3>
        <p className="hb-parent-export-hint">
          Copy {profile.name}'s profile (projects, transcripts, state, progress) into a folder of
          your choice. The original data stays put.
        </p>
        <div className="hb-parent-export-actions">
          <button
            type="button"
            className="hb-btn hb-btn-primary"
            onClick={handleExport}
            disabled={exportStatus === "exporting"}
          >
            {exportStatus === "exporting" ? "Exporting..." : "Export profile data"}
          </button>
          {exportStatus === "done" && exportResult?.kind === "success" ? (
            <span className="hb-parent-export-ok" title={exportResult.path}>
              Exported to {exportResult.folderName}
            </span>
          ) : null}
          {exportStatus === "done" && exportResult?.kind === "canceled" ? (
            <span className="hb-parent-export-info t-pixel">Export canceled</span>
          ) : null}
          {exportStatus === "error" && exportError ? (
            <span className="hb-parent-settings-error">{exportError}</span>
          ) : null}
        </div>
      </div>

      <div className="hb-parent-change-pin">
        <h3 className="t-pixel hb-parent-change-pin-title">Change parent PIN</h3>
        <p className="hb-parent-change-pin-hint">
          The PIN gates parent mode on this machine. Enter your current PIN, then pick a new one.
        </p>
        {pinStatus === "idle" || pinStatus === "saved" ? (
          <div className="hb-parent-change-pin-actions">
            <button
              type="button"
              className="hb-btn hb-btn-ghost"
              onClick={() => {
                resetPinForm();
                setPinStatus("open");
              }}
            >
              {pinStatus === "saved" ? "Change again" : "Change PIN"}
            </button>
            {pinStatus === "saved" ? (
              <span className="hb-parent-settings-ok t-pixel">PIN updated</span>
            ) : null}
          </div>
        ) : (
          <form
            className="hb-parent-change-pin-form"
            onSubmit={handleChangePin}
            onKeyDown={handleChangePinKeyDown}
          >
            <label className="hb-parent-settings-field">
              <span className="t-pixel hb-parent-dt">Current PIN</span>
              <input
                className="hb-input"
                type="password"
                value={currentPin}
                onChange={(e) => {
                  setCurrentPin(e.target.value);
                  if (pinError !== null) setPinError(null);
                }}
                disabled={pinStatus === "saving"}
                autoComplete="current-password"
                aria-invalid={pinError !== null}
                // biome-ignore lint/a11y/noAutofocus: form is user-opened via the Change PIN button, focus is expected
                autoFocus
              />
            </label>
            <label className="hb-parent-settings-field">
              <span className="t-pixel hb-parent-dt">New PIN</span>
              <input
                className="hb-input"
                type="password"
                value={newPin}
                onChange={(e) => {
                  setNewPin(e.target.value);
                  if (pinError !== null) setPinError(null);
                }}
                disabled={pinStatus === "saving"}
                autoComplete="new-password"
                aria-invalid={pinError !== null}
              />
            </label>
            <label className="hb-parent-settings-field">
              <span className="t-pixel hb-parent-dt">Confirm new PIN</span>
              <input
                className="hb-input"
                type="password"
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value);
                  if (pinError !== null) setPinError(null);
                }}
                disabled={pinStatus === "saving"}
                autoComplete="new-password"
                aria-invalid={pinError !== null}
              />
            </label>
            <div className="hb-parent-change-pin-actions">
              <button
                type="submit"
                className="hb-btn hb-btn-primary"
                disabled={pinStatus === "saving"}
              >
                {pinStatus === "saving" ? "Saving..." : "Save new PIN"}
              </button>
              <button
                type="button"
                className="hb-btn hb-btn-ghost"
                onClick={cancelPinForm}
                disabled={pinStatus === "saving"}
              >
                Cancel
              </button>
              {pinStatus === "error" && pinError ? (
                <span className="hb-parent-settings-error">{pinError}</span>
              ) : null}
            </div>
          </form>
        )}
      </div>

      <div className="hb-parent-danger">
        <h3 className="t-pixel hb-parent-danger-title">Danger zone</h3>
        <p className="hb-parent-danger-hint">
          Deleting {profile.name}'s profile removes all saved projects, transcripts, progress, and
          parent flags from disk. This cannot be undone.
        </p>
        {deleteStatus === "confirming" ||
        deleteStatus === "deleting" ||
        deleteStatus === "error" ? (
          <form
            className="hb-parent-danger-form"
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={handleDeleteKeyDown}
          >
            <label className="hb-parent-settings-field">
              <span className="t-pixel hb-parent-dt">Type "{profile.name}" to confirm</span>
              <input
                className="hb-input"
                type="text"
                value={deleteTyped}
                onChange={(e) => {
                  setDeleteTyped(e.target.value);
                  if (deleteStatus === "error") {
                    setDeleteStatus("confirming");
                    setDeleteError(null);
                  }
                }}
                disabled={deleteStatus === "deleting"}
                autoComplete="off"
                spellCheck={false}
                // biome-ignore lint/a11y/noAutofocus: form is user-opened via the Delete profile button, focus is expected
                autoFocus
              />
            </label>
            <div className="hb-parent-danger-actions">
              <button
                type="button"
                className="hb-btn hb-btn-danger"
                onClick={handleDelete}
                disabled={
                  deleteStatus === "deleting" ||
                  !validateDeleteProfileConfirmation(profile.name, deleteTyped).ok
                }
              >
                {deleteStatus === "deleting" ? "Deleting..." : "Delete profile permanently"}
              </button>
              <button
                type="button"
                className="hb-btn hb-btn-ghost"
                onClick={cancelDeleteForm}
                disabled={deleteStatus === "deleting"}
              >
                Cancel
              </button>
              {deleteStatus === "error" && deleteError ? (
                <span className="hb-parent-settings-error">{deleteError}</span>
              ) : null}
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="hb-btn hb-btn-danger"
            onClick={() => setDeleteStatus("confirming")}
          >
            Delete profile
          </button>
        )}
      </div>
    </section>
  );
}
