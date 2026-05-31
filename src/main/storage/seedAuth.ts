import { constants } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type SeedCodexAuthResult = "seeded" | "already-present" | "no-source" | "skipped";

/**
 * Copies a Codex auth file from `sourcePath` to `targetPath` when the target is
 * missing, so an isolated (fresh) userData run still starts past the sign-in
 * gate - an agent driving E2E can't complete the OAuth flow itself.
 *
 * It never overwrites an existing target (so a separately signed-in isolated
 * dir is left alone), and is a no-op when the two paths are the same (the
 * normal, non-isolated run). Codex tokens are encrypted with Electron's
 * keychain-bound safeStorage, not anything path-bound, so the copied file stays
 * decryptable on the same machine and OS user.
 */
export async function seedCodexAuthIfMissing(options: {
  sourcePath: string;
  targetPath: string;
}): Promise<SeedCodexAuthResult> {
  const { sourcePath, targetPath } = options;
  if (sourcePath === targetPath) return "skipped";
  if (await exists(targetPath)) return "already-present";
  if (!(await exists(sourcePath))) return "no-source";
  await mkdir(dirname(targetPath), { recursive: true });
  // Preserve the source's 0o600 perms by copying the file as-is.
  await copyFile(sourcePath, targetPath);
  return "seeded";
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
