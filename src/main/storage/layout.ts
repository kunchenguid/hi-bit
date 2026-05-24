import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type HiBitConfig, normalizeHiBitConfig } from "@shared/config";
import { readJsonFile, writeJsonFile } from "./json";

export const DEFAULT_FACTORY_ID = "default";
export const DEFAULT_LEAD_ID = "lead";

export type HiBitLayout = {
  root: string;
  homePath: string;
  configPath: string;
  authDir: string;
  codexAuthPath: string;
  piAgentDir: string;
  factoriesDir: string;
  defaultFactoryId: string;
  defaultFactoryDir: string;
  defaultFactoryLogbookDir: string;
  defaultFactoryProfilesDir: string;
};

export type HiBitHomeRecord = {
  schemaVersion: 1;
  defaultFactoryId: string;
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
  await Promise.all([
    mkdir(layout.authDir, { recursive: true }),
    mkdir(layout.piAgentDir, { recursive: true }),
    mkdir(layout.defaultFactoryDir, { recursive: true }),
    mkdir(layout.defaultFactoryLogbookDir, { recursive: true }),
    mkdir(layout.defaultFactoryProfilesDir, { recursive: true }),
  ]);

  const home = await readJsonFile<HiBitHomeRecord>(layout.homePath);
  if (!home) {
    await writeJsonFile(layout.homePath, {
      schemaVersion: 1,
      defaultFactoryId: layout.defaultFactoryId,
    } satisfies HiBitHomeRecord);
  }

  const config = normalizeHiBitConfig(await readJsonFile<HiBitConfig>(layout.configPath));
  await writeJsonFile(layout.configPath, config);

  const createdAt = now().toISOString();
  const factoryPath = factoryJsonPath(layout, layout.defaultFactoryId);
  const factory = await readJsonFile<FactoryRecord>(factoryPath);
  if (!factory) {
    await writeJsonFile(factoryPath, {
      schemaVersion: 1,
      id: layout.defaultFactoryId,
      name: "Builder's Factory",
      createdAt,
    } satisfies FactoryRecord);
  }

  const leadPath = leadJsonPath(layout, layout.defaultFactoryId);
  const lead = await readJsonFile<LeadRecord>(leadPath);
  if (!lead) {
    await writeJsonFile(leadPath, {
      schemaVersion: 1,
      id: DEFAULT_LEAD_ID,
      name: "Builder",
      role: "lead_builder",
      createdAt,
    } satisfies LeadRecord);
  }

  return layout;
}

export function buildLayout(root: string): HiBitLayout {
  const factoriesDir = join(root, "factories");
  const defaultFactoryDir = join(factoriesDir, DEFAULT_FACTORY_ID);
  return {
    root,
    homePath: join(root, "home.json"),
    configPath: join(root, "config.json"),
    authDir: join(root, "auth"),
    codexAuthPath: join(root, "auth", "codex.json"),
    piAgentDir: join(root, "pi-agent"),
    factoriesDir,
    defaultFactoryId: DEFAULT_FACTORY_ID,
    defaultFactoryDir,
    defaultFactoryLogbookDir: join(defaultFactoryDir, "logbook"),
    defaultFactoryProfilesDir: join(defaultFactoryDir, "profiles"),
  };
}

export function assertSafeId(id: string, label = "id"): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

export function factoryDir(layout: HiBitLayout, factoryId = layout.defaultFactoryId): string {
  return join(layout.factoriesDir, assertSafeId(factoryId, "factory id"));
}

export function factoryJsonPath(layout: HiBitLayout, factoryId = layout.defaultFactoryId): string {
  return join(factoryDir(layout, factoryId), "factory.json");
}

export function leadJsonPath(layout: HiBitLayout, factoryId = layout.defaultFactoryId): string {
  return join(factoryDir(layout, factoryId), "lead.json");
}

export function profilesDir(layout: HiBitLayout, factoryId = layout.defaultFactoryId): string {
  return join(factoryDir(layout, factoryId), "profiles");
}

export function profileDir(
  layout: HiBitLayout,
  profileId: string,
  factoryId = layout.defaultFactoryId,
): string {
  return join(profilesDir(layout, factoryId), assertSafeId(profileId, "profile id"));
}

export function projectsDir(
  layout: HiBitLayout,
  profileId: string,
  factoryId = layout.defaultFactoryId,
): string {
  return join(profileDir(layout, profileId, factoryId), "projects");
}

export type ProfileConversationPaths = {
  conversationDir: string;
  transcriptPath: string;
  mayorSessionsDir: string;
  conversationStatePath: string;
};

export function profileConversationDir(
  layout: HiBitLayout,
  profileId: string,
  factoryId = layout.defaultFactoryId,
): string {
  return join(profileDir(layout, profileId, factoryId), "conversation");
}

export function profileConversationPaths(
  layout: HiBitLayout,
  profileId: string,
  factoryId = layout.defaultFactoryId,
): ProfileConversationPaths {
  const dir = profileConversationDir(layout, profileId, factoryId);
  return {
    conversationDir: dir,
    transcriptPath: join(dir, "transcript.jsonl"),
    mayorSessionsDir: join(dir, "sessions", "mayor"),
    conversationStatePath: join(dir, "conversation.json"),
  };
}

export function projectDir(
  layout: HiBitLayout,
  profileId: string,
  projectId: string,
  factoryId = layout.defaultFactoryId,
): string {
  return join(projectsDir(layout, profileId, factoryId), assertSafeId(projectId, "project id"));
}
