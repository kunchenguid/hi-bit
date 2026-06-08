import { mkdir, readdir, stat } from "node:fs/promises";
import { type ConceptId, isKnownConceptId } from "@shared/concepts";
import {
  advanceMastery,
  isSkillId,
  masteryOf,
  type SkillId,
  type SkillSignal,
  sanitizeMastery,
} from "@shared/curriculum";
import {
  EMPTY_UNLOCK_STATS,
  type ProfileInput,
  type ProfileRecord,
  type ProfileSettingsInput,
  type ProfileSummary,
  type RoadmapItem,
} from "@shared/profile";
import { readJsonFile, writeJsonFile } from "../storage/json";
import {
  DEFAULT_LEAD_ID,
  type FactoryRecord,
  factoryJsonPath,
  type HiBitHomeRecord,
  type HiBitLayout,
  LAYOUT_VERSION,
  LEGACY_DEFAULT_FACTORY_ID,
  type LeadRecord,
  leadJsonPath,
  profileDir,
  profileJsonPath,
  projectsDir,
} from "../storage/layout";

const SLUG_FALLBACK = "kid";

export function slugifyProfileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : SLUG_FALLBACK;
}

export class ProfileService {
  private readonly profileWrites = new Map<string, Promise<unknown>>();

  constructor(
    private readonly layout: HiBitLayout,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<ProfileSummary[]> {
    await mkdir(this.layout.factoriesDir, { recursive: true });
    const entries = await readdir(this.layout.factoriesDir, { withFileTypes: true });
    const profiles: ProfileSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = await this.read(entry.name);
      if (record) profiles.push(record);
    }
    return profiles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: ProfileInput): Promise<ProfileSummary> {
    validateProfileFields(input);
    const id = await this.nextAvailableId(slugifyProfileName(input.name));
    const timestamp = this.now().toISOString();
    const profile: ProfileRecord = {
      schemaVersion: 1,
      id,
      name: input.name.trim(),
      age: input.age,
      interests: normalizeInterests(input.interests ?? []),
      createdAt: timestamp,
      updatedAt: timestamp,
      unlockedConcepts: [],
      pendingConceptReveals: [],
      unlockStats: { ...EMPTY_UNLOCK_STATS },
      skillMastery: {},
      roadmap: [],
    };
    const notes = input.notes?.trim();
    if (notes) profile.notes = notes;
    // A profile is its own factory: write the factory + lead records (the kid is
    // the lead builder of their factory) alongside the profile record.
    await writeJsonFile(factoryJsonPath(this.layout, id), {
      schemaVersion: 1,
      id,
      name: `${profile.name}'s Factory`,
      createdAt: timestamp,
    } satisfies FactoryRecord);
    await writeJsonFile(leadJsonPath(this.layout, id), {
      schemaVersion: 1,
      id: DEFAULT_LEAD_ID,
      name: profile.name,
      role: "lead_builder",
      createdAt: timestamp,
    } satisfies LeadRecord);
    await writeJsonFile(profileJsonPath(this.layout, id), profile);
    await mkdir(projectsDir(this.layout, id), { recursive: true });
    return profile;
  }

  async get(profileId: string): Promise<ProfileSummary> {
    const profile = await this.read(profileId);
    if (!profile) throw new Error("Profile not found.");
    return profile;
  }

  async update(profileId: string, settings: ProfileSettingsInput): Promise<ProfileSummary> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      const next: ProfileRecord = { ...current, updatedAt: this.now().toISOString() };
      if (settings.name !== undefined) {
        const trimmed = settings.name.trim();
        if (!trimmed) throw new Error("Profile name is required.");
        next.name = trimmed;
      }
      if (settings.age !== undefined) {
        validateAge(settings.age);
        next.age = settings.age;
      }
      if (settings.interests !== undefined) {
        next.interests = normalizeInterests(settings.interests ?? []);
      }
      if (settings.notes !== undefined) {
        const notes = settings.notes?.trim();
        if (notes) next.notes = notes;
        else delete next.notes;
      }
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return next;
    });
  }

  /**
   * Records that the kid has unlocked an inside word, stamping when its trigger
   * first fired. Idempotent: re-unlocking an already-unlocked concept is a no-op
   * that keeps the original `firstSeenAt`.
   */
  async unlockConcept(profileId: string, conceptId: ConceptId): Promise<ProfileSummary> {
    return this.markConceptRevealed(profileId, conceptId);
  }

  async markConceptPendingReveal(profileId: string, conceptId: ConceptId): Promise<ProfileSummary> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      if (
        current.unlockedConcepts.some((concept) => concept.id === conceptId) ||
        current.pendingConceptReveals.some((concept) => concept.id === conceptId)
      ) {
        return current;
      }
      const next: ProfileRecord = {
        ...current,
        pendingConceptReveals: [
          ...current.pendingConceptReveals,
          { id: conceptId, firstSeenAt: this.now().toISOString() },
        ],
      };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return next;
    });
  }

  async markConceptRevealed(profileId: string, conceptId: ConceptId): Promise<ProfileSummary> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      if (current.unlockedConcepts.some((concept) => concept.id === conceptId)) {
        return current;
      }
      const pending = current.pendingConceptReveals.find((concept) => concept.id === conceptId);
      const next: ProfileRecord = {
        ...current,
        pendingConceptReveals: current.pendingConceptReveals.filter(
          (concept) => concept.id !== conceptId,
        ),
        unlockedConcepts: [
          ...current.unlockedConcepts,
          pending ?? { id: conceptId, firstSeenAt: this.now().toISOString() },
        ],
      };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return next;
    });
  }

  /** Bumps the build counter the unlock ladder reads from (one per delegated build). */
  async bumpBuildsDelegated(profileId: string): Promise<void> {
    await this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      const next: ProfileRecord = {
        ...current,
        unlockStats: {
          ...current.unlockStats,
          buildsDelegated: current.unlockStats.buildsDelegated + 1,
        },
      };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
    });
  }

  /** Marks that the kid has opened the Logbook so the word can unlock. */
  async markActivitiesOpened(profileId: string): Promise<ProfileSummary> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      if (current.unlockStats.openedActivities) return current;
      const next: ProfileRecord = {
        ...current,
        unlockStats: { ...current.unlockStats, openedActivities: true },
      };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return next;
    });
  }

  /**
   * Applies Bit's per-turn mastery judgments. Each skill's state advances
   * monotonically (see `advanceMastery`); writes once, only if something
   * actually changed.
   */
  async applySkillSignals(
    profileId: string,
    signals: Partial<Record<SkillId, SkillSignal>>,
  ): Promise<ProfileSummary> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      const skillMastery = { ...current.skillMastery };
      let changed = false;
      for (const [skill, signal] of Object.entries(signals) as [SkillId, SkillSignal][]) {
        if (!signal || !isSkillId(skill)) continue;
        const before = masteryOf(skillMastery, skill);
        const after = advanceMastery(before, signal);
        if (after !== before) {
          skillMastery[skill] = after;
          changed = true;
        }
      }
      if (!changed) return current;
      const next: ProfileRecord = { ...current, skillMastery };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return next;
    });
  }

  /** Parks a deferred ambition on the kid's roadmap and returns the new item. */
  async addRoadmapItem(
    profileId: string,
    input: { title: string; note?: string },
  ): Promise<{ profile: ProfileSummary; item: RoadmapItem }> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      const title = input.title.trim();
      if (!title) throw new Error("Roadmap item needs a title.");
      const timestamp = this.now().toISOString();
      const item: RoadmapItem = {
        id: `roadmap-${this.now().getTime().toString(36)}-${current.roadmap.length}`,
        title,
        status: "parked",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const note = input.note?.trim();
      if (note) item.note = note;
      const next: ProfileRecord = { ...current, roadmap: [...current.roadmap, item] };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return { profile: next, item };
    });
  }

  /** Updates a parked ambition's status or title (e.g. parked -> started -> done). */
  async updateRoadmapItem(
    profileId: string,
    itemId: string,
    patch: { status?: RoadmapItem["status"]; title?: string },
  ): Promise<ProfileSummary> {
    return this.withProfileWrite(profileId, async () => {
      const current = await this.get(profileId);
      let found = false;
      const roadmap = current.roadmap.map((item) => {
        if (item.id !== itemId) return item;
        found = true;
        const updated: RoadmapItem = { ...item, updatedAt: this.now().toISOString() };
        if (patch.status) updated.status = patch.status;
        if (patch.title !== undefined) {
          const title = patch.title.trim();
          if (title) updated.title = title;
        }
        return updated;
      });
      if (!found) throw new Error("Roadmap item not found.");
      const next: ProfileRecord = { ...current, roadmap };
      await writeJsonFile(profileJsonPath(this.layout, profileId), next);
      return next;
    });
  }

  async getActiveId(): Promise<string | null> {
    const home = await readJsonFile<HiBitHomeRecord>(this.layout.homePath);
    return home?.activeProfileId ?? null;
  }

  async setActiveId(profileId: string | null): Promise<void> {
    const home = await readJsonFile<HiBitHomeRecord>(this.layout.homePath);
    const next: HiBitHomeRecord = {
      schemaVersion: 1,
      layoutVersion: home?.layoutVersion ?? LAYOUT_VERSION,
    };
    if (profileId) next.activeProfileId = profileId;
    await writeJsonFile(this.layout.homePath, next);
  }

  private async read(profileId: string): Promise<ProfileRecord | null> {
    const record = await readJsonFile<ProfileRecord>(profileJsonPath(this.layout, profileId));
    return record ? normalizeProfile(record) : null;
  }

  private async nextAvailableId(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    // "default" is reserved: it named the legacy shared factory and a kid factory
    // keyed by it would collide with leftover migration state.
    while (
      candidate === LEGACY_DEFAULT_FACTORY_ID ||
      (await pathExists(profileDir(this.layout, candidate)))
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private async withProfileWrite<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.profileWrites.get(profileId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.profileWrites.set(profileId, next);
    try {
      return await next;
    } finally {
      if (this.profileWrites.get(profileId) === next) {
        this.profileWrites.delete(profileId);
      }
    }
  }
}

/** Backfills unlock fields for profiles created before the unlock ladder existed. */
function normalizeProfile(record: ProfileRecord): ProfileRecord {
  // Backfills unlock fields for old profiles and drops retired concept ids (e.g.
  // the former "workshop", now folded into "factory") so the vocabulary gate
  // never trips on a word the ladder no longer knows.
  return {
    ...record,
    unlockedConcepts: (record.unlockedConcepts ?? []).filter((concept) =>
      isKnownConceptId(concept.id),
    ),
    pendingConceptReveals: (record.pendingConceptReveals ?? []).filter((concept) =>
      isKnownConceptId(concept.id),
    ),
    unlockStats: record.unlockStats ?? { ...EMPTY_UNLOCK_STATS },
    skillMastery: sanitizeMastery(record.skillMastery),
    roadmap: normalizeRoadmap(record.roadmap),
  };
}

const ROADMAP_STATUSES: ReadonlySet<RoadmapItem["status"]> = new Set(["parked", "started", "done"]);

function normalizeRoadmap(roadmap: unknown): RoadmapItem[] {
  if (!Array.isArray(roadmap)) return [];
  const items: RoadmapItem[] = [];
  for (const raw of roadmap) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RoadmapItem;
    if (typeof item.id !== "string" || typeof item.title !== "string") continue;
    // A missing or unknown status is repaired to "parked" so it never leaks
    // into status filters or the UI as "- undefined".
    items.push(ROADMAP_STATUSES.has(item.status) ? item : { ...item, status: "parked" });
  }
  return items;
}

function validateProfileFields(input: ProfileInput): void {
  if (!input.name.trim()) throw new Error("Profile name is required.");
  validateAge(input.age);
}

function validateAge(age: number): void {
  if (!Number.isInteger(age) || age < 3 || age > 18) {
    throw new Error("Profile age must be an integer between 3 and 18.");
  }
}

function normalizeInterests(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const interests: string[] = [];
  for (const value of input) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    interests.push(trimmed);
  }
  return interests;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
