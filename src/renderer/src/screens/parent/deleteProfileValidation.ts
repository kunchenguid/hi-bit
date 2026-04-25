export type DeleteProfileValidation = { ok: true } | { ok: false; error: string };

export function validateDeleteProfileConfirmation(
  profileName: string,
  typedName: string,
): DeleteProfileValidation {
  if (profileName.trim().length === 0) {
    return { ok: false, error: "Profile name is missing. Cannot confirm deletion." };
  }
  const trimmed = typedName.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Type the profile name to confirm deletion." };
  }
  if (trimmed !== profileName) {
    return { ok: false, error: "Name doesn't match. Try retyping it exactly." };
  }
  return { ok: true };
}
