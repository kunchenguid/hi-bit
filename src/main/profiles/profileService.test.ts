import { mkdtemp, readFile } from "node:fs/promises";
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

  it("creates and lists kid profiles under the default factory", async () => {
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
});
