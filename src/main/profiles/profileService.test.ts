import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, type HiBitLayout, profileDir } from "../storage/layout";
import { ProfileService, slugifyProfileName } from "./profileService";

async function createService(): Promise<{ layout: HiBitLayout; service: ProfileService }> {
  const root = await mkdtemp(join(tmpdir(), "hibit-profiles-"));
  const layout = await bootstrapLayout(root);
  let tick = 0;
  return {
    layout,
    service: new ProfileService(layout, () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5 + tick++))),
  };
}

describe("slugifyProfileName", () => {
  it("creates safe stable ids from kid names", () => {
    expect(slugifyProfileName("Ada Lovelace")).toBe("ada-lovelace");
    expect(slugifyProfileName("Zoë !!!")).toBe("zoe");
    expect(slugifyProfileName("!!!")).toBe("kid");
  });
});

describe("ProfileService", () => {
  let layout: HiBitLayout;
  let service: ProfileService;

  beforeEach(async () => {
    const setup = await createService();
    layout = setup.layout;
    service = setup.service;
  });

  it("creates and lists kid profiles, each as its own factory", async () => {
    const profile = await service.create({
      name: "Ada Lovelace",
      age: 9,
      interests: [" cats ", "space", "Cats", ""],
      notes: "  Gets frustrated fast.  ",
    });

    expect(profile).toEqual({
      schemaVersion: 1,
      id: "ada-lovelace",
      name: "Ada Lovelace",
      age: 9,
      interests: ["cats", "space"],
      notes: "Gets frustrated fast.",
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
      unlockedConcepts: [],
      pendingConceptReveals: [],
      unlockStats: { buildsDelegated: 0, openedActivities: false },
      skillMastery: {},
      roadmap: [],
    });
    await expect(service.list()).resolves.toEqual([profile]);

    const raw = await readFile(join(profileDir(layout, profile.id), "profile.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(profile);
  });

  it("dedupes profile ids and validates required fields", async () => {
    const first = await service.create({ name: "Sam", age: 8 });
    const second = await service.create({ name: "Sam", age: 10 });

    expect(first.id).toBe("sam");
    expect(second.id).toBe("sam-2");
    await expect(service.create({ name: " ", age: 9 })).rejects.toThrow(/name/i);
    await expect(service.create({ name: "Ada", age: 2 })).rejects.toThrow(/age/i);
    await expect(service.create({ name: "Ada", age: 19 })).rejects.toThrow(/age/i);
    await expect(service.create({ name: "Ada", age: 9.5 })).rejects.toThrow(/age/i);
  });

  it("persists and updates the active profile id in home.json", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    await expect(service.getActiveId()).resolves.toBeNull();
    await service.setActiveId(ada.id);
    await expect(service.getActiveId()).resolves.toBe(ada.id);

    const home = JSON.parse(await readFile(layout.homePath, "utf8"));
    expect(home.activeProfileId).toBe(ada.id);

    await service.setActiveId(null);
    await expect(service.getActiveId()).resolves.toBeNull();
  });

  it("updates basic profile fields without changing the profile id", async () => {
    const ada = await service.create({ name: "Ada", age: 9, interests: ["cats"] });

    const updated = await service.update(ada.id, {
      name: "  Ada L.  ",
      age: 10,
      interests: ["space", "SPACE", "drawing"],
      notes: "  Loves CSS colors.  ",
    });

    expect(updated).toMatchObject({
      id: ada.id,
      name: "Ada L.",
      age: 10,
      interests: ["space", "drawing"],
      notes: "Loves CSS colors.",
      updatedAt: "2026-01-02T03:04:06.000Z",
    });
    await expect(service.get(ada.id)).resolves.toEqual(updated);
  });

  it("unlocks a concept once and stamps when it first fired", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    const afterFirst = await service.unlockConcept(ada.id, "bot");
    expect(afterFirst.unlockedConcepts).toEqual([
      { id: "bot", firstSeenAt: "2026-01-02T03:04:06.000Z" },
    ]);

    // Re-unlocking is a no-op that keeps the original timestamp.
    const afterSecond = await service.unlockConcept(ada.id, "bot");
    expect(afterSecond.unlockedConcepts).toEqual([
      { id: "bot", firstSeenAt: "2026-01-02T03:04:06.000Z" },
    ]);
    await expect(service.get(ada.id)).resolves.toMatchObject({
      unlockedConcepts: [{ id: "bot", firstSeenAt: "2026-01-02T03:04:06.000Z" }],
    });
  });

  it("tracks concepts that are unlocked but not revealed yet", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    const pending = await service.markConceptPendingReveal(ada.id, "bot");
    expect(pending.pendingConceptReveals).toEqual([
      { id: "bot", firstSeenAt: "2026-01-02T03:04:06.000Z" },
    ]);
    expect(pending.unlockedConcepts).toEqual([]);

    const revealed = await service.markConceptRevealed(ada.id, "bot");
    expect(revealed.pendingConceptReveals).toEqual([]);
    expect(revealed.unlockedConcepts).toEqual([
      { id: "bot", firstSeenAt: "2026-01-02T03:04:06.000Z" },
    ]);
  });

  it("bumps the build counter and marks the activities view as opened", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    await service.bumpBuildsDelegated(ada.id);
    await service.bumpBuildsDelegated(ada.id);
    await service.markActivitiesOpened(ada.id);

    await expect(service.get(ada.id)).resolves.toMatchObject({
      unlockStats: { buildsDelegated: 2, openedActivities: true },
    });
  });

  it("keeps every build counter bump when multiple builds start together", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    await Promise.all(Array.from({ length: 10 }, () => service.bumpBuildsDelegated(ada.id)));

    await expect(service.get(ada.id)).resolves.toMatchObject({
      unlockStats: { buildsDelegated: 10, openedActivities: false },
    });
  });

  it("backfills unlock and curriculum fields for profiles written before they existed", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });
    // Simulate an old on-disk record with no unlock or curriculum fields, plus a
    // stale mastery entry for a retired skill that must not survive the load.
    const path = join(profileDir(layout, ada.id), "profile.json");
    const raw = JSON.parse(await readFile(path, "utf8"));
    delete raw.unlockedConcepts;
    delete raw.unlockStats;
    delete raw.skillMastery;
    delete raw.roadmap;
    raw.skillMastery = { decompose: "grasped", blueprint: "fluent" };
    raw.roadmap = [
      { id: "r1", title: "Good item", status: "started" },
      { id: "r2", title: "Bad status item" }, // missing status -> repaired to parked
      { title: "no id" }, // dropped
    ];
    await writeFile(path, JSON.stringify(raw), "utf8");

    await expect(service.get(ada.id)).resolves.toMatchObject({
      unlockedConcepts: [],
      pendingConceptReveals: [],
      unlockStats: { buildsDelegated: 0, openedActivities: false },
      skillMastery: { decompose: "grasped" },
      roadmap: [
        { id: "r1", title: "Good item", status: "started" },
        { id: "r2", title: "Bad status item", status: "parked" },
      ],
    });
  });

  it("advances skill mastery monotonically from Bit's per-turn signals", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    const first = await service.applySkillSignals(ada.id, {
      "ask-creation": { demonstrated: true },
      "iterate-feedback": { demonstrated: true },
    });
    expect(first.skillMastery).toEqual({
      "ask-creation": "grasped",
      "iterate-feedback": "grasped",
    });

    // An unprompted demonstration of a grasped skill promotes it to fluent; a
    // plain demonstration can never pull a grasped skill backwards.
    const second = await service.applySkillSignals(ada.id, {
      "ask-creation": { demonstrated: true, unprompted: true },
      "iterate-feedback": { demonstrated: true },
    });
    expect(second.skillMastery).toEqual({
      "ask-creation": "fluent",
      "iterate-feedback": "grasped",
    });
  });

  it("does not rewrite the profile when no signal changes mastery", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });
    await service.applySkillSignals(ada.id, { "ask-creation": { demonstrated: true } });
    const before = await readFile(join(profileDir(layout, ada.id), "profile.json"), "utf8");

    // A plain demonstration of an already-grasped skill does not change it.
    const same = await service.applySkillSignals(ada.id, {
      "ask-creation": { demonstrated: true },
    });
    expect(same.skillMastery).toEqual({ "ask-creation": "grasped" });
    const after = await readFile(join(profileDir(layout, ada.id), "profile.json"), "utf8");
    expect(after).toBe(before);
  });

  it("parks ambitions on the roadmap and moves them along", async () => {
    const ada = await service.create({ name: "Ada", age: 9 });

    const { item } = await service.addRoadmapItem(ada.id, {
      title: "  Minecraft world  ",
      note: "blocks you can place",
    });
    expect(item).toMatchObject({
      title: "Minecraft world",
      note: "blocks you can place",
      status: "parked",
    });

    const started = await service.updateRoadmapItem(ada.id, item.id, { status: "started" });
    expect(started.roadmap).toEqual([
      { ...item, status: "started", updatedAt: expect.any(String) },
    ]);

    await expect(service.updateRoadmapItem(ada.id, "nope", { status: "done" })).rejects.toThrow(
      /not found/i,
    );
  });
});
