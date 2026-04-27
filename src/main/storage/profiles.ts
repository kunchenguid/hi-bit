import { randomUUID } from "node:crypto";
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Profile, ProfileInput, ProfileSettingsInput } from "@shared/profile";
import {
  emptyProgress,
  type KnowledgePointProgress,
  type KnowledgePointStatus,
  PROGRESS_VERSION,
  type Progress,
  type ProjectEntry,
} from "@shared/progress";
import {
  bootstrapProfileDirs,
  type HiBitLayout,
  type ProfilePaths,
  profilePathsFor,
} from "./layout";
import { renderClaudeSettings, renderOpencodeConfig } from "./profileHarnessConfig";
import { promptsBitPath } from "./prompts";

const SLUG_FALLBACK = "kid";

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : SLUG_FALLBACK;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function nextAvailableId(layout: HiBitLayout, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await pathExists(profilePathsFor(layout, candidate).root)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function validateInput(input: ProfileInput): void {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error("Profile name must not be empty");
  }
  if (!Number.isInteger(input.age) || input.age < 3 || input.age > 18) {
    throw new Error("Profile age must be an integer between 3 and 18");
  }
}

export function renderInitialStateMd(profile: Profile): string {
  const interests = profile.interests.length > 0 ? profile.interests.join(", ") : "not set yet";
  const parentNotes = profile.notes && profile.notes.length > 0 ? profile.notes : "None.";
  return `# State for ${profile.name}

Last updated: ${profile.createdAt}

## Profile

- Name: ${profile.name}
- Age: ${profile.age}
- Interests: ${interests}

## Parent notes

${parentNotes}

## Voice preferences

Not set yet. Bit will learn from early sessions.

## Current dream

None selected yet.

## Current session

No active session right now.

## Recent session summaries

None yet. This is ${profile.name}'s first session.

## Recent parent directives

None yet.

## Flagged messages

None yet.
`;
}

export async function createProfile(layout: HiBitLayout, input: ProfileInput): Promise<Profile> {
  validateInput(input);
  const id = await nextAvailableId(layout, slugify(input.name));
  const paths = profilePathsFor(layout, id);
  await bootstrapProfileDirs(paths);

  const profile: Profile = {
    id,
    name: input.name.trim(),
    age: input.age,
    interests: input.interests?.map((i) => i.trim()).filter((i) => i.length > 0) ?? [],
    notes: input.notes?.trim() || undefined,
    sessions: {
      kid: randomUUID(),
      parent: randomUUID(),
    },
    createdAt: new Date().toISOString(),
    dreamHistory: [],
  };

  await writeProfileFile(paths, profile);
  await writeFile(paths.stateFile, renderInitialStateMd(profile), "utf8");
  await writeFile(paths.progressFile, `${JSON.stringify(emptyProgress(), null, 2)}\n`, "utf8");
  await writeFile(paths.claudeSettingsFile, renderClaudeSettings(), "utf8");
  await writeFile(paths.opencodeConfigFile, renderOpencodeConfig(), "utf8");

  const bitSource = promptsBitPath(layout);
  await copyFile(bitSource, paths.agentsFile);
  await copyFile(bitSource, paths.claudeFile);

  return profile;
}

export async function writeProfileFile(paths: ProfilePaths, profile: Profile): Promise<void> {
  await writeFile(paths.profileFile, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

const MANAGED_BIT_PROMPT_HEADING = /^# Bit - System Prompt v\d+/;

function isManagedBitPromptContent(content: string): boolean {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";
  return MANAGED_BIT_PROMPT_HEADING.test(firstLine);
}

async function refreshManagedBitPromptFile(target: string, sourceContent: string): Promise<void> {
  let existing: string;
  try {
    existing = await readFile(target, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (existing === sourceContent) return;
  if (!isManagedBitPromptContent(existing)) return;
  await writeFile(target, sourceContent, "utf8");
}

export async function ensureProfileScaffold(
  layout: HiBitLayout,
  paths: ProfilePaths,
  profile: Profile,
): Promise<void> {
  await bootstrapProfileDirs(paths);
  const bitSource = promptsBitPath(layout);
  const tasks: Array<Promise<unknown>> = [];

  if (!(await pathExists(paths.stateFile))) {
    tasks.push(writeFile(paths.stateFile, renderInitialStateMd(profile), "utf8"));
  }
  if (!(await pathExists(paths.progressFile))) {
    tasks.push(
      writeFile(paths.progressFile, `${JSON.stringify(emptyProgress(), null, 2)}\n`, "utf8"),
    );
  }
  if (!(await pathExists(paths.claudeSettingsFile))) {
    tasks.push(writeFile(paths.claudeSettingsFile, renderClaudeSettings(), "utf8"));
  }
  if (!(await pathExists(paths.opencodeConfigFile))) {
    tasks.push(writeFile(paths.opencodeConfigFile, renderOpencodeConfig(), "utf8"));
  }
  const agentsExists = await pathExists(paths.agentsFile);
  const claudeExists = await pathExists(paths.claudeFile);
  if (!agentsExists) {
    tasks.push(copyFile(bitSource, paths.agentsFile));
  }
  if (!claudeExists) {
    tasks.push(copyFile(bitSource, paths.claudeFile));
  }
  if (agentsExists || claudeExists) {
    const sourceContent = await readFile(bitSource, "utf8").catch((err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    });
    if (sourceContent !== null) {
      if (agentsExists) {
        tasks.push(refreshManagedBitPromptFile(paths.agentsFile, sourceContent));
      }
      if (claudeExists) {
        tasks.push(refreshManagedBitPromptFile(paths.claudeFile, sourceContent));
      }
    }
  }
  await Promise.all(tasks);
}

export async function readProfile(layout: HiBitLayout, profileId: string): Promise<Profile | null> {
  const paths = profilePathsFor(layout, profileId);
  try {
    const raw = await readFile(paths.profileFile, "utf8");
    return JSON.parse(raw) as Profile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function readProgress(layout: HiBitLayout, profileId: string): Promise<Progress> {
  const paths = profilePathsFor(layout, profileId);
  let raw: string;
  try {
    raw = await readFile(paths.progressFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyProgress();
    }
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<Progress> & { version?: unknown };
  const fileVersion = typeof parsed.version === "number" ? parsed.version : PROGRESS_VERSION;
  if (fileVersion > PROGRESS_VERSION) {
    throw new Error(
      `progress.json for profile "${profileId}" was written by a newer version of Hi Bit (schema v${fileVersion}, this build supports v${PROGRESS_VERSION}). Upgrade Hi Bit or restore an older backup.`,
    );
  }
  return { ...parsed, version: PROGRESS_VERSION } as Progress;
}

export type UpdateKpStatusOptions = {
  evidence?: string;
  now?: () => Date;
};

export async function updateKpStatus(
  layout: HiBitLayout,
  profileId: string,
  kpId: string,
  status: KnowledgePointStatus | null,
  options: UpdateKpStatusOptions = {},
): Promise<Progress> {
  const trimmedKpId = kpId.trim();
  if (trimmedKpId.length === 0) {
    throw new Error("KP id must not be empty");
  }
  const paths = profilePathsFor(layout, profileId);
  const profile = await readProfile(layout, profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  const progress = await readProgress(layout, profileId);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const nextKps: Record<string, KnowledgePointProgress> = { ...progress.knowledgePoints };
  if (status === null) {
    delete nextKps[trimmedKpId];
  } else {
    const existing = nextKps[trimmedKpId];
    const trimmedEvidence = options.evidence?.trim();
    nextKps[trimmedKpId] = {
      status,
      firstSeenAt: existing?.firstSeenAt ?? now,
      updatedAt: now,
      ...(trimmedEvidence && trimmedEvidence.length > 0
        ? { evidence: trimmedEvidence }
        : existing?.evidence
          ? { evidence: existing.evidence }
          : {}),
    };
  }
  const updated: Progress = { ...progress, knowledgePoints: nextKps };
  await writeFile(paths.progressFile, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export type UpdateKpSkippedOptions = {
  now?: () => Date;
};

export async function updateKpSkipped(
  layout: HiBitLayout,
  profileId: string,
  kpId: string,
  skipped: boolean,
  options: UpdateKpSkippedOptions = {},
): Promise<Progress> {
  const trimmedKpId = kpId.trim();
  if (trimmedKpId.length === 0) {
    throw new Error("KP id must not be empty");
  }
  const paths = profilePathsFor(layout, profileId);
  const profile = await readProfile(layout, profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  const progress = await readProgress(layout, profileId);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const nextKps: Record<string, KnowledgePointProgress> = { ...progress.knowledgePoints };
  const existing = nextKps[trimmedKpId];
  if (skipped) {
    nextKps[trimmedKpId] = existing
      ? { ...existing, skipped: true, updatedAt: now }
      : { status: "saw_it", firstSeenAt: now, updatedAt: now, skipped: true };
  } else if (existing) {
    const { skipped: _dropped, ...rest } = existing;
    nextKps[trimmedKpId] = { ...rest, updatedAt: now };
  }
  const updated: Progress = { ...progress, knowledgePoints: nextKps };
  await writeFile(paths.progressFile, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export type UpsertProjectEntryOptions = {
  now?: () => Date;
};

export async function upsertProjectEntry(
  layout: HiBitLayout,
  profileId: string,
  dreamId: string,
  slug: string,
  options: UpsertProjectEntryOptions = {},
): Promise<Progress> {
  const trimmedDreamId = dreamId.trim();
  const trimmedSlug = slug.trim();
  if (trimmedDreamId.length === 0) {
    throw new Error("Dream id must not be empty");
  }
  if (trimmedSlug.length === 0) {
    throw new Error("Project slug must not be empty");
  }
  const paths = profilePathsFor(layout, profileId);
  const profile = await readProfile(layout, profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  const progress = await readProgress(layout, profileId);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const idx = progress.projects.findIndex(
    (p) => p.dreamId === trimmedDreamId && p.slug === trimmedSlug,
  );
  const nextProjects: ProjectEntry[] = [...progress.projects];
  if (idx === -1) {
    nextProjects.push({
      dreamId: trimmedDreamId,
      slug: trimmedSlug,
      startedAt: now,
      lastActiveAt: now,
    });
  } else {
    const existing = nextProjects[idx];
    if (existing) {
      nextProjects[idx] = { ...existing, lastActiveAt: now };
    }
  }
  const updated: Progress = { ...progress, projects: nextProjects };
  await writeFile(paths.progressFile, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export async function updateProfileSettings(
  layout: HiBitLayout,
  profileId: string,
  settings: ProfileSettingsInput,
): Promise<Profile> {
  const paths = profilePathsFor(layout, profileId);
  const profile = await readProfile(layout, profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  const next: Profile = { ...profile };
  if (settings.name !== undefined) {
    const trimmed = settings.name.trim();
    if (trimmed.length === 0) {
      throw new Error("Profile name must not be empty");
    }
    next.name = trimmed;
  }
  if (settings.age !== undefined) {
    const n = settings.age;
    if (!Number.isInteger(n) || n < 3 || n > 18) {
      throw new Error("Profile age must be an integer between 3 and 18");
    }
    next.age = n;
  }
  if (settings.sessionTargetMinutes !== undefined) {
    if (settings.sessionTargetMinutes === null) {
      next.sessionTargetMinutes = undefined;
    } else {
      const n = settings.sessionTargetMinutes;
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 240) {
        throw new Error("Session target minutes must be an integer between 1 and 240");
      }
      next.sessionTargetMinutes = n;
    }
  }
  if (settings.voicePreferences !== undefined) {
    if (settings.voicePreferences === null) {
      next.voicePreferences = undefined;
    } else {
      const trimmed = settings.voicePreferences.trim();
      next.voicePreferences = trimmed.length > 0 ? trimmed : undefined;
    }
  }
  if (settings.notes !== undefined) {
    if (settings.notes === null) {
      next.notes = undefined;
    } else {
      const trimmed = settings.notes.trim();
      next.notes = trimmed.length > 0 ? trimmed : undefined;
    }
  }
  if (settings.interests !== undefined) {
    next.interests = normalizeInterests(settings.interests);
  }
  // Drop undefined values so profile.json stays clean
  const cleaned: Profile = { ...next };
  if (cleaned.sessionTargetMinutes === undefined) delete cleaned.sessionTargetMinutes;
  if (cleaned.voicePreferences === undefined) delete cleaned.voicePreferences;
  if (cleaned.notes === undefined) delete cleaned.notes;
  await writeProfileFile(paths, cleaned);
  return cleaned;
}

function normalizeInterests(input: readonly string[] | null): string[] {
  if (input === null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export async function setCurrentDream(
  layout: HiBitLayout,
  profileId: string,
  dreamId: string,
): Promise<Profile> {
  const trimmedDreamId = dreamId.trim();
  if (trimmedDreamId.length === 0) {
    throw new Error("Dream id must not be empty");
  }
  const paths = profilePathsFor(layout, profileId);
  const profile = await readProfile(layout, profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  const dreamHistory = profile.dreamHistory.includes(trimmedDreamId)
    ? profile.dreamHistory
    : [...profile.dreamHistory, trimmedDreamId];

  // Switching to a different dream rotates the kid session so Bit starts a
  // fresh agent session with the new dream context. Without this, the long-
  // lived Claude process resumes its prior conversation and keeps acting as
  // if it's still in the previous dream.
  const isDreamChanging =
    typeof profile.currentDreamId === "string" && profile.currentDreamId !== trimmedDreamId;
  const sessions = isDreamChanging ? { ...profile.sessions, kid: randomUUID() } : profile.sessions;

  const updated: Profile = {
    ...profile,
    currentDreamId: trimmedDreamId,
    dreamHistory,
    sessions,
  };
  await writeProfileFile(paths, updated);

  const progressRaw = await readFile(paths.progressFile, "utf8").catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  });
  const progress: Progress = progressRaw ? (JSON.parse(progressRaw) as Progress) : emptyProgress();
  if (!progress.dreamHistory.includes(trimmedDreamId)) {
    progress.dreamHistory = [...progress.dreamHistory, trimmedDreamId];
  }
  await writeFile(paths.progressFile, `${JSON.stringify(progress, null, 2)}\n`, "utf8");

  return updated;
}

export async function deleteProfile(layout: HiBitLayout, profileId: string): Promise<void> {
  const trimmedId = profileId.trim();
  if (trimmedId.length === 0) {
    throw new Error("Profile id must not be empty");
  }
  const paths = profilePathsFor(layout, trimmedId);
  await rm(paths.root, { recursive: true, force: true });
}

export type ExportProfileOptions = {
  now?: () => Date;
};

export async function exportProfile(
  layout: HiBitLayout,
  profileId: string,
  destDir: string,
  options: ExportProfileOptions = {},
): Promise<string> {
  const trimmedId = profileId.trim();
  if (trimmedId.length === 0) {
    throw new Error("Profile id must not be empty");
  }
  const trimmedDest = destDir.trim();
  if (trimmedDest.length === 0) {
    throw new Error("Export destination must not be empty");
  }
  const paths = profilePathsFor(layout, trimmedId);
  if (!(await pathExists(paths.root))) {
    throw new Error(`Profile not found: ${trimmedId}`);
  }
  const now = (options.now ?? (() => new Date()))();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const exportPath = join(trimmedDest, `${trimmedId}-${stamp}`);
  if (await pathExists(exportPath)) {
    throw new Error(`Export path already exists: ${exportPath}`);
  }
  await mkdir(trimmedDest, { recursive: true });
  await cp(paths.root, exportPath, { recursive: true });
  return exportPath;
}

export async function listProfiles(layout: HiBitLayout): Promise<Profile[]> {
  let entries: string[];
  try {
    entries = await readdir(layout.profilesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const profiles = await Promise.all(
    entries.map(async (entry) => {
      const paths = profilePathsFor(layout, entry);
      const stats = await stat(paths.root).catch(() => null);
      if (!stats?.isDirectory()) {
        return null;
      }
      return readProfile(layout, entry);
    }),
  );

  return profiles
    .filter((p): p is Profile => p !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
