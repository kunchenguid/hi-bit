import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateLayout } from "./layout";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-migrate-"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Lays down the pre-migration `factories/default/profiles/<id>/…` tree. */
async function seedLegacyLayout(root: string): Promise<void> {
  const factories = join(root, "factories");
  const def = join(factories, "default");
  await writeJson(join(def, "factory.json"), {
    schemaVersion: 1,
    id: "default",
    name: "Builder's Factory",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  await writeJson(join(def, "lead.json"), {
    schemaVersion: 1,
    id: "lead",
    name: "Builder",
    role: "lead_builder",
    createdAt: "2025-01-01T00:00:00.000Z",
  });
  await mkdir(join(def, "logbook"), { recursive: true });

  // Profile "ada" with a creation, a conversation, a blueprint and a job.
  const ada = join(def, "profiles", "ada");
  await writeJson(join(ada, "profile.json"), {
    schemaVersion: 1,
    id: "ada",
    name: "Ada",
    age: 9,
    interests: ["space"],
    createdAt: "2025-02-02T00:00:00.000Z",
    updatedAt: "2025-02-02T00:00:00.000Z",
    unlockedConcepts: [],
    pendingConceptReveals: [],
    unlockStats: { buildsDelegated: 0, openedActivities: false },
  });
  await mkdir(join(ada, "conversation"), { recursive: true });
  await writeFile(
    join(ada, "conversation", "transcript.jsonl"),
    `${JSON.stringify({ timestamp: "t", type: "chat_message", message: { id: "m1" } })}\n`,
    "utf8",
  );
  const proj = join(ada, "projects", "proj1");
  await writeJson(join(proj, "project.json"), {
    schemaVersion: 1,
    id: "proj1",
    factoryId: "default",
    profileId: "ada",
    title: "Maze",
    createdAt: "2025-02-03T00:00:00.000Z",
    updatedAt: "2025-02-03T00:00:00.000Z",
  });
  await writeJson(join(proj, "blueprints", "bp1.json"), {
    schemaVersion: 1,
    id: "bp1",
    factoryId: "default",
    projectId: "proj1",
    leadPrompt: "make a maze",
    projectCatalog: [],
    status: "dispatched",
    createdAt: "2025-02-03T00:00:00.000Z",
  });
  await writeJson(join(proj, "jobs", "job1.json"), {
    schemaVersion: 1,
    id: "job1",
    factoryId: "default",
    projectId: "proj1",
    blueprintId: "bp1",
    status: "completed",
    createdAt: "2025-02-03T00:00:00.000Z",
    updatedAt: "2025-02-03T00:00:00.000Z",
  });

  // A second, leaner profile to prove multiple kids migrate.
  const leo = join(def, "profiles", "leo");
  await writeJson(join(leo, "profile.json"), {
    schemaVersion: 1,
    id: "leo",
    name: "Leo",
    age: 7,
    interests: [],
    createdAt: "2025-03-03T00:00:00.000Z",
    updatedAt: "2025-03-03T00:00:00.000Z",
    unlockedConcepts: [],
    pendingConceptReveals: [],
    unlockStats: { buildsDelegated: 0, openedActivities: false },
  });

  await writeJson(join(root, "home.json"), {
    schemaVersion: 1,
    defaultFactoryId: "default",
    activeProfileId: "ada",
  });
}

describe("migrateLayout", () => {
  const now = () => new Date("2026-06-01T00:00:00.000Z");

  it("re-scopes profiles into their own per-kid factories", async () => {
    const root = await tempRoot();
    await seedLegacyLayout(root);

    await migrateLayout(root, now);

    const factories = join(root, "factories");

    // The shared default factory + the profiles/ level are gone.
    expect(await exists(join(factories, "default"))).toBe(false);

    // Each profile now sits directly as its own factory.
    const ada = join(factories, "ada");
    expect(await exists(join(ada, "profile.json"))).toBe(true);
    expect(await exists(join(ada, "conversation", "transcript.jsonl"))).toBe(true);
    expect(await exists(join(factories, "leo", "profile.json"))).toBe(true);

    // Conversation content survives the move.
    const transcript = await readFile(join(ada, "conversation", "transcript.jsonl"), "utf8");
    expect(transcript).toContain("m1");

    // A per-kid factory.json + lead.json (the kid as lead builder) are written.
    const factory = JSON.parse(await readFile(join(ada, "factory.json"), "utf8"));
    expect(factory).toEqual({
      schemaVersion: 1,
      id: "ada",
      name: "Ada's Factory",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const lead = JSON.parse(await readFile(join(ada, "lead.json"), "utf8"));
    expect(lead).toEqual({
      schemaVersion: 1,
      id: "lead",
      name: "Ada",
      role: "lead_builder",
      createdAt: "2026-06-01T00:00:00.000Z",
    });

    // factoryId is stripped from every record.
    const project = JSON.parse(
      await readFile(join(ada, "projects", "proj1", "project.json"), "utf8"),
    );
    expect(project).not.toHaveProperty("factoryId");
    expect(project.profileId).toBe("ada");
    const blueprint = JSON.parse(
      await readFile(join(ada, "projects", "proj1", "blueprints", "bp1.json"), "utf8"),
    );
    expect(blueprint).not.toHaveProperty("factoryId");
    const job = JSON.parse(
      await readFile(join(ada, "projects", "proj1", "jobs", "job1.json"), "utf8"),
    );
    expect(job).not.toHaveProperty("factoryId");

    // home.json is upgraded: layoutVersion marker in, defaultFactoryId out.
    const home = JSON.parse(await readFile(join(root, "home.json"), "utf8"));
    expect(home).toEqual({
      schemaVersion: 1,
      layoutVersion: 2,
      activeProfileId: "ada",
    });
  });

  it("is idempotent and crash-safe to re-run", async () => {
    const root = await tempRoot();
    await seedLegacyLayout(root);

    await migrateLayout(root, now);
    const firstHome = await readFile(join(root, "home.json"), "utf8");
    const firstProject = await readFile(
      join(root, "factories", "ada", "projects", "proj1", "project.json"),
      "utf8",
    );

    // Second run must be a no-op that neither throws nor corrupts state.
    await migrateLayout(root, now);
    expect(await readFile(join(root, "home.json"), "utf8")).toBe(firstHome);
    expect(
      await readFile(join(root, "factories", "ada", "projects", "proj1", "project.json"), "utf8"),
    ).toBe(firstProject);
    expect(await exists(join(root, "factories", "default"))).toBe(false);
  });

  it("does nothing on a fresh install with no legacy data", async () => {
    const root = await tempRoot();
    await migrateLayout(root, now);
    // No legacy + no home → migration leaves home creation to bootstrap.
    expect(await exists(join(root, "home.json"))).toBe(false);
    expect(await exists(join(root, "factories", "default"))).toBe(false);
  });
});
