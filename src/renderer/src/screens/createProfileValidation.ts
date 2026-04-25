export type CreateProfileFieldErrors = {
  name?: string;
  age?: string;
};

export function validateCreateProfileFields(input: {
  name: string;
  age: string;
}): CreateProfileFieldErrors {
  const errs: CreateProfileFieldErrors = {};
  if (input.name.trim().length === 0) {
    errs.name = "We need a name to greet you by.";
  }
  const parsed = Number.parseInt(input.age, 10);
  if (!Number.isInteger(parsed) || parsed < 3 || parsed > 18) {
    errs.age = "Age must be a whole number between 3 and 18.";
  }
  return errs;
}

export type CreateProfileFormFields = {
  name: string;
  age: string;
  interests: string;
  notes: string;
};

export function isCreateProfileFormDirty(fields: CreateProfileFormFields): boolean {
  return (
    fields.name.length > 0 ||
    fields.age.length > 0 ||
    fields.interests.length > 0 ||
    fields.notes.length > 0
  );
}
