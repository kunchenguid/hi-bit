import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ProfileInput,
  ProfileRecord,
  ProfileSettingsInput,
  ProfileSummary,
} from "@shared/profile";
import { readJsonFile, writeJsonFile } from "../storage/json";
import { type HiBitHomeRecord, type HiBitLayout, profileDir, profilesDir } from "../storage/layout";

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
  constructor(
    private readonly layout: HiBitLayout,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<ProfileSummary[]> {
    await mkdir(profilesDir(this.layout), { recursive: true });
    const entries = await readdir(profilesDir(this.layout), { withFileTypes: true });
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
    };
    const notes = input.notes?.trim();
    if (notes) profile.notes = notes;
    await writeJsonFile(this.profileJsonPath(id), profile);
    await mkdir(projectsDirForProfile(this.layout, id), { recursive: true });
    return profile;
  }

  async get(profileId: string): Promise<ProfileSummary> {
    const profile = await this.read(profileId);
    if (!profile) throw new Error("Profile not found.");
    return profile;
  }

  async update(profileId: string, settings: ProfileSettingsInput): Promise<ProfileSummary> {
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
    await writeJsonFile(this.profileJsonPath(profileId), next);
    return next;
  }

  async getActiveId(): Promise<string | null> {
    const home = await readJsonFile<HiBitHomeRecord>(this.layout.homePath);
    return home?.activeProfileId ?? null;
  }

  async setActiveId(profileId: string | null): Promise<void> {
    const home = (await readJsonFile<HiBitHomeRecord>(this.layout.homePath)) ?? {
      schemaVersion: 1,
      defaultFactoryId: this.layout.defaultFactoryId,
    };
    const next: HiBitHomeRecord = {
      schemaVersion: 1,
      defaultFactoryId: home.defaultFactoryId,
    };
    if (profileId) next.activeProfileId = profileId;
    await writeJsonFile(this.layout.homePath, next);
  }

  private async read(profileId: string): Promise<ProfileRecord | null> {
    return readJsonFile<ProfileRecord>(this.profileJsonPath(profileId));
  }

  private async nextAvailableId(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (await pathExists(profileDir(this.layout, candidate))) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private profileJsonPath(profileId: string): string {
    return join(profileDir(this.layout, profileId), "profile.json");
  }
}

function projectsDirForProfile(layout: HiBitLayout, profileId: string): string {
  return join(profileDir(layout, profileId), "projects");
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
