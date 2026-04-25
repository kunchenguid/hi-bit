export type NewFileValidation = { ok: true; name: string } | { ok: false; error: string };

const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export const ALLOWED_NEW_FILE_EXTENSIONS = ["html", "css", "js"] as const;

export type AllowedFileExtension = (typeof ALLOWED_NEW_FILE_EXTENSIONS)[number];

function getExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export function validateNewFilename(name: string, existing: readonly string[]): NewFileValidation {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Type a filename first." };
  }
  if (!SAFE_NAME_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "Use letters, numbers, dots, dashes, or underscores. No spaces.",
    };
  }
  const ext = getExtension(trimmed);
  if (!ext) {
    return { ok: false, error: "Add an extension like .html, .css, or .js." };
  }
  if (!(ALLOWED_NEW_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      error: "For now, only .html, .css, and .js files are supported.",
    };
  }
  if (existing.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "A file with that name already exists." };
  }
  return { ok: true, name: trimmed };
}
