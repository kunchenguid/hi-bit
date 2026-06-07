import { mkdir, readdir, rename } from "node:fs/promises";
import { join, relative } from "node:path";
import { type HiBitConfig, normalizeHiBitConfig } from "@shared/config";
import { readJsonFile, removeIfExists, writeJsonFile } from "./json";

/**
 * The legacy single shared factory id. Before the factory-per-kid layout, every
 * profile lived under `factories/default/profiles/`. We still need the literal
 * to find that old tree during migration and to keep it reserved as a profile id.
 */
export const LEGACY_DEFAULT_FACTORY_ID = "default";
export const DEFAULT_LEAD_ID = "lead";
/** The current on-disk layout version, stamped into `home.json`. */
export const LAYOUT_VERSION = 2;
/** A scratch container name used mid-migration; never a valid kid slug. */
const MIGRATION_STAGING_DIR = "__migrating__";

export type HiBitLayout = {
  root: string;
  homePath: string;
  configPath: string;
  authDir: string;
  codexAuthPath: string;
  piAgentDir: string;
  /** Holds one factory directory per kid, keyed by profile id. */
  factoriesDir: string;
  /** On-disk home for downloaded local models (e.g. the Whisper voice model). */
  modelsDir: string;
};

export type HiBitHomeRecord = {
  schemaVersion: 1;
  layoutVersion: number;
  activeProfileId?: string;
};

export type FactoryRecord = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
};

export type LeadRecord = {
  schemaVersion: 1;
  id: string;
  name: string;
  role: "lead_builder";
  createdAt: string;
};

export async function bootstrapLayout(root: string, now = () => new Date()): Promise<HiBitLayout> {
  const layout = buildLayout(root);

  // Bring any pre-factory-per-kid data up to the current layout before anything
  // reads it. No-op once migrated, and on a truly fresh install.
  await migrateLayout(root, now);

  await Promise.all([
    mkdir(layout.authDir, { recursive: true }),
    mkdir(layout.piAgentDir, { recursive: true }),
    mkdir(layout.factoriesDir, { recursive: true }),
    mkdir(layout.modelsDir, { recursive: true }),
  ]);

  const home = await readJsonFile<HiBitHomeRecord>(layout.homePath);
  if (!home) {
    await writeJsonFile(layout.homePath, {
      schemaVersion: 1,
      layoutVersion: LAYOUT_VERSION,
    } satisfies HiBitHomeRecord);
  }

  const config = normalizeHiBitConfig(await readJsonFile<HiBitConfig>(layout.configPath));
  await writeJsonFile(layout.configPath, config);

  return layout;
}

export function buildLayout(root: string): HiBitLayout {
  return {
    root,
    homePath: join(root, "home.json"),
    configPath: join(root, "config.json"),
    authDir: join(root, "auth"),
    codexAuthPath: join(root, "auth", "codex.json"),
    piAgentDir: join(root, "pi-agent"),
    factoriesDir: join(root, "factories"),
    modelsDir: join(root, "models"),
  };
}

export function assertSafeId(id: string, label = "id"): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

/**
 * A kid's factory directory. Factory and profile are 1:1, so the factory is
 * keyed by `profileId` and this directory doubles as the profile home.
 */
export function factoryDir(layout: HiBitLayout, profileId: string): string {
  return join(layout.factoriesDir, assertSafeId(profileId, "profile id"));
}

/** The profile home is the kid's factory directory. */
export function profileDir(layout: HiBitLayout, profileId: string): string {
  return factoryDir(layout, profileId);
}

export function factoryJsonPath(layout: HiBitLayout, profileId: string): string {
  return join(factoryDir(layout, profileId), "factory.json");
}

export function leadJsonPath(layout: HiBitLayout, profileId: string): string {
  return join(factoryDir(layout, profileId), "lead.json");
}

export function profileJsonPath(layout: HiBitLayout, profileId: string): string {
  return join(factoryDir(layout, profileId), "profile.json");
}

export function projectsDir(layout: HiBitLayout, profileId: string): string {
  return join(factoryDir(layout, profileId), "projects");
}

export function projectDir(layout: HiBitLayout, profileId: string, projectId: string): string {
  return join(projectsDir(layout, profileId), assertSafeId(projectId, "project id"));
}

export type ProfileConversationPaths = {
  /** The whole profile directory - the jail root for Bit's profile-scoped tools. */
  profileRoot: string;
  conversationDir: string;
  transcriptPath: string;
  bitSessionsDir: string;
  conversationStatePath: string;
  /** Where builder-attached pictures are written, kept out of the transcript jsonl. */
  attachmentsDir: string;
  /**
   * Sidecar index for pictures that have no chat message of their own - those a
   * bot or Bit found (`search_image`) or made (`generate_image`) - so they can be
   * recalled by id alongside builder attachments (which stay transcript-derived).
   */
  attachmentsIndexPath: string;
};

export function profileConversationDir(layout: HiBitLayout, profileId: string): string {
  return join(factoryDir(layout, profileId), "conversation");
}

export function profileConversationPaths(
  layout: HiBitLayout,
  profileId: string,
): ProfileConversationPaths {
  const dir = profileConversationDir(layout, profileId);
  return {
    profileRoot: factoryDir(layout, profileId),
    conversationDir: dir,
    transcriptPath: join(dir, "transcript.jsonl"),
    bitSessionsDir: join(dir, "sessions", "bit"),
    conversationStatePath: join(dir, "conversation.json"),
    attachmentsDir: join(dir, "attachments"),
    attachmentsIndexPath: join(dir, "attachments", "index.jsonl"),
  };
}

/**
 * Migrates the legacy `factories/default/profiles/<id>/` tree to one factory per
 * kid at `factories/<id>/`. Guarded by `home.layoutVersion`, idempotent and
 * crash-safe: the legacy container is renamed out of the way first (which also
 * sidesteps a kid whose id is literally "default"), profiles are moved one by
 * one (re-runs skip already-moved ones), records are rewritten in place, and the
 * version marker is stamped last so a crash before it lets the next launch
 * safely finish the job.
 */
export async function migrateLayout(root: string, now = () => new Date()): Promise<void> {
  const layout = buildLayout(root);
  const home = await readJsonFile<HiBitHomeRecord>(layout.homePath);
  if (home && (home.layoutVersion ?? 0) >= LAYOUT_VERSION) return;

  const legacyContainer = join(layout.factoriesDir, LEGACY_DEFAULT_FACTORY_ID);
  const staging = join(layout.factoriesDir, MIGRATION_STAGING_DIR);
  const hadLegacy = (await pathExists(legacyContainer)) || (await pathExists(staging));

  // 1. Move the legacy container aside so target paths can never overlap it.
  if (await pathExists(legacyContainer)) {
    if (!(await pathExists(staging))) await rename(legacyContainer, staging);
  }

  // 2. Lift each legacy profile up to its own factory dir.
  if (await pathExists(staging)) {
    const legacyProfilesDir = join(staging, "profiles");
    for (const id of await dirNames(legacyProfilesDir)) {
      const target = join(layout.factoriesDir, assertSafeId(id, "profile id"));
      if (!(await pathExists(target))) {
        await rename(join(legacyProfilesDir, id), target);
      }
    }
  }

  // 3. Give every migrated factory its factory.json + lead.json and strip the
  //    now-dead factoryId from its records. Runs only during this one upgrade.
  if (home || hadLegacy) {
    for (const id of await dirNames(layout.factoriesDir)) {
      const profile = await readJsonFile<{ name?: string }>(profileJsonPath(layout, id));
      if (!profile) continue;
      await ensureFactoryRecords(layout, id, profile.name ?? id, now);
      await stripFactoryIdFromProjects(layout, id);
      await rewriteMigratedConversationState(layout, id, legacyContainer, staging);
    }
  }

  await removeIfExists(staging);

  // 4. Stamp the marker last. Skip entirely on a truly fresh install (no home,
  //    no legacy) so bootstrap creates home.json instead.
  if (home || hadLegacy) {
    const next: HiBitHomeRecord = { schemaVersion: 1, layoutVersion: LAYOUT_VERSION };
    if (home?.activeProfileId) next.activeProfileId = home.activeProfileId;
    await writeJsonFile(layout.homePath, next);
  }
}

async function ensureFactoryRecords(
  layout: HiBitLayout,
  profileId: string,
  name: string,
  now: () => Date,
): Promise<void> {
  const createdAt = now().toISOString();
  if (!(await readJsonFile<FactoryRecord>(factoryJsonPath(layout, profileId)))) {
    await writeJsonFile(factoryJsonPath(layout, profileId), {
      schemaVersion: 1,
      id: profileId,
      name: `${name}'s Factory`,
      createdAt,
    } satisfies FactoryRecord);
  }
  if (!(await readJsonFile<LeadRecord>(leadJsonPath(layout, profileId)))) {
    await writeJsonFile(leadJsonPath(layout, profileId), {
      schemaVersion: 1,
      id: DEFAULT_LEAD_ID,
      name,
      role: "lead_builder",
      createdAt,
    } satisfies LeadRecord);
  }
}

async function stripFactoryIdFromProjects(layout: HiBitLayout, profileId: string): Promise<void> {
  const projects = projectsDir(layout, profileId);
  for (const projectId of await dirNames(projects)) {
    const dir = join(projects, projectId);
    await stripFactoryIdAt(join(dir, "project.json"));
    for (const sub of ["blueprints", "jobs"]) {
      const subDir = join(dir, sub);
      for (const file of await jsonFileNames(subDir)) {
        await stripFactoryIdAt(join(subDir, file));
      }
    }
  }
}

async function stripFactoryIdAt(path: string): Promise<void> {
  const record = await readJsonFile<Record<string, unknown>>(path);
  if (!record || !("factoryId" in record)) return;
  delete record.factoryId;
  await writeJsonFile(path, record);
}

async function rewriteMigratedConversationState(
  layout: HiBitLayout,
  profileId: string,
  legacyContainer: string,
  staging: string,
): Promise<void> {
  const conversationPaths = profileConversationPaths(layout, profileId);
  const record = await readJsonFile<Record<string, unknown>>(
    conversationPaths.conversationStatePath,
  );
  if (!record || typeof record.activeBitSessionFile !== "string") return;

  for (const oldProfileRoot of [
    join(legacyContainer, "profiles", profileId),
    join(staging, "profiles", profileId),
  ]) {
    const oldBitSessionsDir = join(oldProfileRoot, "conversation", "sessions", "bit");
    const suffix = relative(oldBitSessionsDir, record.activeBitSessionFile);
    if (!suffix.startsWith("..") && suffix !== "") {
      record.activeBitSessionFile = join(conversationPaths.bitSessionsDir, suffix);
      await writeJsonFile(conversationPaths.conversationStatePath, record);
      return;
    }
  }
}

async function dirNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function jsonFileNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    await stat(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
