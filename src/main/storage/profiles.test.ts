import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyProgress, type Progress } from "@shared/progress";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, type HiBitLayout, profilePathsFor } from "./layout";
import { renderClaudeSettings, renderOpencodeConfig } from "./profileHarnessConfig";
import {
  createProfile,
  deleteProfile,
  ensureProfileScaffold,
  exportProfile,
  listProfiles,
  readProfile,
  readProgress,
  renderInitialStateMd,
  restartCurrentDream,
  setCurrentDream,
  slugify,
  updateKpSkipped,
  updateKpStatus,
  updateProfileSettings,
  upsertProjectEntry,
} from "./profiles";
import { promptsBitPath } from "./prompts";

const BIT_FIXTURE = "# Bit fixture\n\nHello from tests.\n";

describe("slugify", () => {
  it("lowercases and dashes names", () => {
    expect(slugify("Ada Lovelace")).toBe("ada-lovelace");
  });

  it("strips diacritics", () => {
    expect(slugify("Zoë")).toBe("zoe");
  });

  it("falls back when the slug is empty", () => {
    expect(slugify("!!!")).toBe("kid");
  });
});

describe("profile storage", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-profiles-"));
    layout = await bootstrapLayout(root);
    await writeFile(promptsBitPath(layout), BIT_FIXTURE, "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("listProfiles returns an empty list on a fresh layout", async () => {
    await expect(listProfiles(layout)).resolves.toEqual([]);
  });

  it("createProfile writes a profile.json with generated session IDs", async () => {
    const profile = await createProfile(layout, {
      name: "Ada Lovelace",
      age: 9,
      interests: ["cats", "space"],
      notes: "Loves drawing",
    });

    expect(profile.id).toBe("ada-lovelace");
    expect(profile.name).toBe("Ada Lovelace");
    expect(profile.age).toBe(9);
    expect(profile.interests).toEqual(["cats", "space"]);
    expect(profile.notes).toBe("Loves drawing");
    expect(profile.sessions.kid).not.toBe(profile.sessions.parent);
    expect(profile.sessions.kid).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.dreamHistory).toEqual([]);
    expect(profile.currentDreamId).toBeUndefined();

    const raw = await readFile(join(layout.profilesDir, profile.id, "profile.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(profile);
  });

  it("createProfile seeds state.md with kid identity", async () => {
    const profile = await createProfile(layout, {
      name: "Ada",
      age: 9,
      interests: ["cats"],
      notes: "Loves drawing",
    });
    const paths = profilePathsFor(layout, profile.id);
    const state = await readFile(paths.stateFile, "utf8");
    expect(state).toContain("# State for Ada");
    expect(state).toContain("- Age: 9");
    expect(state).toContain("Interests: cats");
    expect(state).toContain("Loves drawing");
    expect(state).toContain("## Current dream");
  });

  it("renderInitialStateMd handles empty interests and missing notes", () => {
    const md = renderInitialStateMd({
      id: "ada",
      name: "Ada",
      age: 9,
      interests: [],
      sessions: { kid: "k", parent: "p" },
      createdAt: "2026-04-23T00:00:00.000Z",
      dreamHistory: [],
    });
    expect(md).toContain("Interests: not set yet");
    expect(md).toContain("## Parent notes\n\nNone.");
  });

  it("createProfile seeds progress.json as an empty Progress v1", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    const raw = await readFile(paths.progressFile, "utf8");
    expect(JSON.parse(raw)).toEqual(emptyProgress());
  });

  it("createProfile copies bit.md into AGENTS.md and CLAUDE.md", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await expect(readFile(paths.agentsFile, "utf8")).resolves.toBe(BIT_FIXTURE);
    await expect(readFile(paths.claudeFile, "utf8")).resolves.toBe(BIT_FIXTURE);
  });

  it("createProfile seeds .claude/settings.json and opencode.json with the Bit tool spec", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await expect(readFile(paths.claudeSettingsFile, "utf8")).resolves.toBe(renderClaudeSettings());
    await expect(readFile(paths.opencodeConfigFile, "utf8")).resolves.toBe(renderOpencodeConfig());
  });

  it("ensureProfileScaffold writes missing state.md, progress.json, AGENTS.md, CLAUDE.md for legacy profiles", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await unlink(paths.stateFile);
    await unlink(paths.progressFile);
    await unlink(paths.agentsFile);
    await unlink(paths.claudeFile);

    await ensureProfileScaffold(layout, paths, profile);

    await expect(stat(paths.stateFile)).resolves.toBeDefined();
    await expect(stat(paths.progressFile)).resolves.toBeDefined();
    await expect(readFile(paths.agentsFile, "utf8")).resolves.toBe(BIT_FIXTURE);
    await expect(readFile(paths.claudeFile, "utf8")).resolves.toBe(BIT_FIXTURE);
    const state = await readFile(paths.stateFile, "utf8");
    expect(state).toContain("# State for Ada");
    const progress = await readFile(paths.progressFile, "utf8");
    expect(JSON.parse(progress)).toEqual(emptyProgress());
  });

  it("ensureProfileScaffold seeds .claude/settings.json and opencode.json for legacy profiles", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await unlink(paths.claudeSettingsFile);
    await unlink(paths.opencodeConfigFile);

    await ensureProfileScaffold(layout, paths, profile);

    await expect(readFile(paths.claudeSettingsFile, "utf8")).resolves.toBe(renderClaudeSettings());
    await expect(readFile(paths.opencodeConfigFile, "utf8")).resolves.toBe(renderOpencodeConfig());
  });

  it("ensureProfileScaffold preserves a parent-edited .claude/settings.json or opencode.json", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    const customClaude = '{"permissions":{"allow":["Read"]}}\n';
    const customOpencode = '{"permission":{"read":"allow"}}\n';
    await writeFile(paths.claudeSettingsFile, customClaude, "utf8");
    await writeFile(paths.opencodeConfigFile, customOpencode, "utf8");

    await ensureProfileScaffold(layout, paths, profile);

    await expect(readFile(paths.claudeSettingsFile, "utf8")).resolves.toBe(customClaude);
    await expect(readFile(paths.opencodeConfigFile, "utf8")).resolves.toBe(customOpencode);
  });

  it("ensureProfileScaffold does not overwrite files that already exist", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await writeFile(paths.stateFile, "custom state edited by user", "utf8");
    await writeFile(paths.agentsFile, "custom AGENTS content", "utf8");

    await ensureProfileScaffold(layout, paths, profile);

    await expect(readFile(paths.stateFile, "utf8")).resolves.toBe("custom state edited by user");
    await expect(readFile(paths.agentsFile, "utf8")).resolves.toBe("custom AGENTS content");
  });

  it("ensureProfileScaffold refreshes a stale managed AGENTS.md/CLAUDE.md when bit.md was updated", async () => {
    const NEW_BIT = "# Bit - System Prompt v1\n\nUpdated rules go here.\n";
    const STALE_BIT = "# Bit - System Prompt v0\n\nOld rules.\n";
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await writeFile(paths.agentsFile, STALE_BIT, "utf8");
    await writeFile(paths.claudeFile, STALE_BIT, "utf8");
    await writeFile(promptsBitPath(layout), NEW_BIT, "utf8");

    await ensureProfileScaffold(layout, paths, profile);

    await expect(readFile(paths.agentsFile, "utf8")).resolves.toBe(NEW_BIT);
    await expect(readFile(paths.claudeFile, "utf8")).resolves.toBe(NEW_BIT);
  });

  it("ensureProfileScaffold preserves AGENTS.md/CLAUDE.md when first line is not the managed Bit prompt heading", async () => {
    const NEW_BIT = "# Bit - System Prompt v1\n\nUpdated rules go here.\n";
    const CUSTOM = "# My custom rules\n\nDo something different.\n";
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await writeFile(paths.agentsFile, CUSTOM, "utf8");
    await writeFile(paths.claudeFile, CUSTOM, "utf8");
    await writeFile(promptsBitPath(layout), NEW_BIT, "utf8");

    await ensureProfileScaffold(layout, paths, profile);

    await expect(readFile(paths.agentsFile, "utf8")).resolves.toBe(CUSTOM);
    await expect(readFile(paths.claudeFile, "utf8")).resolves.toBe(CUSTOM);
  });

  it("ensureProfileScaffold leaves a managed AGENTS.md/CLAUDE.md alone when content already matches bit.md", async () => {
    const SAME_BIT = "# Bit - System Prompt v0\n\nSame content.\n";
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await writeFile(paths.agentsFile, SAME_BIT, "utf8");
    await writeFile(paths.claudeFile, SAME_BIT, "utf8");
    await writeFile(promptsBitPath(layout), SAME_BIT, "utf8");

    await ensureProfileScaffold(layout, paths, profile);

    await expect(readFile(paths.agentsFile, "utf8")).resolves.toBe(SAME_BIT);
    await expect(readFile(paths.claudeFile, "utf8")).resolves.toBe(SAME_BIT);
  });

  it("ensureProfileScaffold is idempotent and safe to call repeatedly", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await ensureProfileScaffold(layout, paths, profile);
    await ensureProfileScaffold(layout, paths, profile);
    await expect(stat(paths.stateFile)).resolves.toBeDefined();
  });

  it("createProfile dedupes IDs when the slug already exists", async () => {
    const first = await createProfile(layout, { name: "Sam", age: 8 });
    const second = await createProfile(layout, { name: "Sam", age: 10 });
    expect(first.id).toBe("sam");
    expect(second.id).toBe("sam-2");
  });

  it("createProfile rejects invalid inputs", async () => {
    await expect(createProfile(layout, { name: " ", age: 9 })).rejects.toThrow(
      /name must not be empty/,
    );
    await expect(createProfile(layout, { name: "Ada", age: 2 })).rejects.toThrow(
      /age must be an integer/,
    );
    await expect(createProfile(layout, { name: "Ada", age: 19 })).rejects.toThrow(
      /age must be an integer/,
    );
    await expect(createProfile(layout, { name: "Ada", age: 9.5 })).rejects.toThrow(
      /age must be an integer/,
    );
  });

  it("readProfile returns null for a missing profile", async () => {
    await expect(readProfile(layout, "nobody")).resolves.toBeNull();
  });

  it("readProgress returns the persisted progress for a profile", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    const seeded: Progress = {
      ...emptyProgress(),
      knowledgePoints: {
        "html-doc-shell": {
          status: "did_with_help",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:10:00.000Z",
        },
      },
    };
    await writeFile(paths.progressFile, `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
    await expect(readProgress(layout, profile.id)).resolves.toEqual(seeded);
  });

  it("readProgress returns emptyProgress when progress.json is missing", async () => {
    await expect(readProgress(layout, "nobody")).resolves.toEqual(emptyProgress());
  });

  it("readProgress throws a helpful error when the file was written by a newer Hi-Bit version", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    const futureProgress = { ...emptyProgress(), version: 999 };
    await writeFile(paths.progressFile, `${JSON.stringify(futureProgress, null, 2)}\n`, "utf8");
    await expect(readProgress(layout, profile.id)).rejects.toThrow(
      /written by a newer version of Hi Bit/,
    );
  });

  it("readProgress treats a missing version as the current schema version", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    const legacy = { knowledgePoints: {}, projects: [], sessions: [], dreamHistory: [] };
    await writeFile(paths.progressFile, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
    await expect(readProgress(layout, profile.id)).resolves.toEqual(emptyProgress());
  });

  it("setCurrentDream updates profile.json and progress.json", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const updated = await setCurrentDream(layout, profile.id, "hello-card");
    expect(updated.currentDreamId).toBe("hello-card");
    expect(updated.dreamHistory).toEqual(["hello-card"]);

    const paths = profilePathsFor(layout, profile.id);
    const profileRaw = await readFile(paths.profileFile, "utf8");
    expect(JSON.parse(profileRaw)).toEqual(updated);

    const progressRaw = await readFile(paths.progressFile, "utf8");
    const progress = JSON.parse(progressRaw) as Progress;
    expect(progress.dreamHistory).toEqual(["hello-card"]);
  });

  it("setCurrentDream dedupes repeat picks but still updates currentDreamId", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await setCurrentDream(layout, profile.id, "hello-card");
    await setCurrentDream(layout, profile.id, "pet-page");
    const again = await setCurrentDream(layout, profile.id, "hello-card");
    expect(again.currentDreamId).toBe("hello-card");
    expect(again.dreamHistory).toEqual(["hello-card", "pet-page"]);

    const paths = profilePathsFor(layout, profile.id);
    const progress = JSON.parse(await readFile(paths.progressFile, "utf8")) as Progress;
    expect(progress.dreamHistory).toEqual(["hello-card", "pet-page"]);
  });

  it("setCurrentDream rotates the kid session id whenever the active dream changes", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const originalKidSession = profile.sessions.kid;
    const originalParentSession = profile.sessions.parent;

    const first = await setCurrentDream(layout, profile.id, "hello-card");
    expect(first.sessions.kid).not.toBe(originalKidSession);
    expect(first.sessions.kid).toMatch(/^[0-9a-f-]{36}$/);

    const second = await setCurrentDream(layout, profile.id, "dice-roller");
    expect(second.sessions.kid).not.toBe(first.sessions.kid);
    expect(second.sessions.kid).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.sessions.parent).toBe(originalParentSession);

    const paths = profilePathsFor(layout, profile.id);
    const persisted = JSON.parse(await readFile(paths.profileFile, "utf8"));
    expect(persisted.sessions.kid).toBe(second.sessions.kid);
  });

  it("setCurrentDream does not rotate the kid session id when picking the same dream again", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const first = await setCurrentDream(layout, profile.id, "hello-card");
    const again = await setCurrentDream(layout, profile.id, "hello-card");
    expect(again.sessions.kid).toBe(first.sessions.kid);
  });

  it("restartCurrentDream rotates the kid session even when restarting the current dream", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const first = await setCurrentDream(layout, profile.id, "hello-card");

    const restarted = await restartCurrentDream(layout, profile.id, "hello-card");

    expect(restarted.currentDreamId).toBe("hello-card");
    expect(restarted.dreamHistory).toEqual(["hello-card"]);
    expect(restarted.sessions.kid).not.toBe(first.sessions.kid);
    expect(restarted.sessions.parent).toBe(first.sessions.parent);
  });

  it("setCurrentDream rejects an empty dream id", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await expect(setCurrentDream(layout, profile.id, "  ")).rejects.toThrow(
      /Dream id must not be empty/,
    );
  });

  it("setCurrentDream rejects an unknown profile", async () => {
    await expect(setCurrentDream(layout, "ghost", "hello-card")).rejects.toThrow(
      /Profile not found/,
    );
  });

  it("updateKpStatus seeds a new KP entry with both timestamps", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const fixed = new Date("2026-04-23T00:00:00.000Z");
    const progress = await updateKpStatus(layout, profile.id, "html-doc-shell", "saw_it", {
      now: () => fixed,
    });
    expect(progress.knowledgePoints["html-doc-shell"]).toEqual({
      status: "saw_it",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
    });

    const paths = profilePathsFor(layout, profile.id);
    const disk = JSON.parse(await readFile(paths.progressFile, "utf8")) as Progress;
    expect(disk.knowledgePoints["html-doc-shell"].status).toBe("saw_it");
  });

  it("updateKpStatus preserves firstSeenAt but bumps updatedAt on later change", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await updateKpStatus(layout, profile.id, "html-doc-shell", "saw_it", {
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });
    const progress = await updateKpStatus(layout, profile.id, "html-doc-shell", "did_with_help", {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
    });
    expect(progress.knowledgePoints["html-doc-shell"]).toEqual({
      status: "did_with_help",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z",
    });
  });

  it("updateKpStatus attaches evidence when provided and preserves it on re-update", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const first = await updateKpStatus(layout, profile.id, "html-doc-shell", "did_unprompted", {
      evidence: "She typed <!DOCTYPE html> unprompted",
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });
    expect(first.knowledgePoints["html-doc-shell"].evidence).toBe(
      "She typed <!DOCTYPE html> unprompted",
    );

    const second = await updateKpStatus(layout, profile.id, "html-doc-shell", "explained_it", {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
    });
    expect(second.knowledgePoints["html-doc-shell"].evidence).toBe(
      "She typed <!DOCTYPE html> unprompted",
    );
  });

  it("updateKpStatus removes the KP entry when status is null", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await updateKpStatus(layout, profile.id, "html-doc-shell", "saw_it");
    const cleared = await updateKpStatus(layout, profile.id, "html-doc-shell", null);
    expect(cleared.knowledgePoints["html-doc-shell"]).toBeUndefined();
  });

  it("updateKpStatus rejects an empty KP id and unknown profile", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await expect(updateKpStatus(layout, profile.id, "  ", "saw_it")).rejects.toThrow(
      /KP id must not be empty/,
    );
    await expect(updateKpStatus(layout, "ghost", "html-doc-shell", "saw_it")).rejects.toThrow(
      /Profile not found/,
    );
  });

  it("updateKpSkipped seeds a new KP entry marked skipped when none exists yet", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const fixed = new Date("2026-04-23T00:00:00.000Z");
    const progress = await updateKpSkipped(layout, profile.id, "css-colors", true, {
      now: () => fixed,
    });
    const entry = progress.knowledgePoints["css-colors"];
    expect(entry).toEqual({
      status: "saw_it",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      skipped: true,
    });
  });

  it("updateKpSkipped preserves existing status and firstSeenAt when toggling on", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await updateKpStatus(layout, profile.id, "css-colors", "did_with_help", {
      now: () => new Date("2026-04-22T00:00:00.000Z"),
      evidence: "learned in school",
    });
    const progress = await updateKpSkipped(layout, profile.id, "css-colors", true, {
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });
    const entry = progress.knowledgePoints["css-colors"];
    expect(entry?.status).toBe("did_with_help");
    expect(entry?.firstSeenAt).toBe("2026-04-22T00:00:00.000Z");
    expect(entry?.updatedAt).toBe("2026-04-23T00:00:00.000Z");
    expect(entry?.skipped).toBe(true);
    expect(entry?.evidence).toBe("learned in school");
  });

  it("updateKpSkipped clears the skipped flag and bumps updatedAt when toggled off", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await updateKpSkipped(layout, profile.id, "css-colors", true, {
      now: () => new Date("2026-04-22T00:00:00.000Z"),
    });
    const progress = await updateKpSkipped(layout, profile.id, "css-colors", false, {
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });
    const entry = progress.knowledgePoints["css-colors"];
    expect(entry?.skipped).toBeUndefined();
    expect(entry?.updatedAt).toBe("2026-04-23T00:00:00.000Z");
  });

  it("updateKpSkipped(false) on an absent KP is a no-op that leaves progress.json clean", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const progress = await updateKpSkipped(layout, profile.id, "css-colors", false);
    expect(progress.knowledgePoints["css-colors"]).toBeUndefined();
  });

  it("updateKpSkipped rejects an empty KP id and unknown profile", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await expect(updateKpSkipped(layout, profile.id, "  ", true)).rejects.toThrow(
      /KP id must not be empty/,
    );
    await expect(updateKpSkipped(layout, "ghost", "css-colors", true)).rejects.toThrow(
      /Profile not found/,
    );
  });

  it("updateKpSkipped(true) then updateKpStatus(null) removes the KP including the skipped flag", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await updateKpSkipped(layout, profile.id, "css-colors", true);
    const cleared = await updateKpStatus(layout, profile.id, "css-colors", null);
    expect(cleared.knowledgePoints["css-colors"]).toBeUndefined();
  });

  it("upsertProjectEntry seeds a new project entry with startedAt and lastActiveAt", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const fixed = new Date("2026-04-23T00:00:00.000Z");
    const progress = await upsertProjectEntry(layout, profile.id, "snake", "snake", {
      now: () => fixed,
    });
    expect(progress.projects).toEqual([
      {
        dreamId: "snake",
        slug: "snake",
        startedAt: "2026-04-23T00:00:00.000Z",
        lastActiveAt: "2026-04-23T00:00:00.000Z",
      },
    ]);
    const paths = profilePathsFor(layout, profile.id);
    const disk = JSON.parse(await readFile(paths.progressFile, "utf8")) as Progress;
    expect(disk.projects).toEqual(progress.projects);
  });

  it("upsertProjectEntry preserves startedAt but bumps lastActiveAt on repeat", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await upsertProjectEntry(layout, profile.id, "snake", "snake", {
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });
    const progress = await upsertProjectEntry(layout, profile.id, "snake", "snake", {
      now: () => new Date("2026-04-24T10:00:00.000Z"),
    });
    expect(progress.projects).toEqual([
      {
        dreamId: "snake",
        slug: "snake",
        startedAt: "2026-04-23T00:00:00.000Z",
        lastActiveAt: "2026-04-24T10:00:00.000Z",
      },
    ]);
  });

  it("upsertProjectEntry resets startedAt when replacing a project attempt", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await upsertProjectEntry(layout, profile.id, "snake", "snake", {
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });

    const progress = await upsertProjectEntry(layout, profile.id, "snake", "snake", {
      now: () => new Date("2026-04-24T10:00:00.000Z"),
      resetStartedAt: true,
    });

    expect(progress.projects).toEqual([
      {
        dreamId: "snake",
        slug: "snake",
        startedAt: "2026-04-24T10:00:00.000Z",
        lastActiveAt: "2026-04-24T10:00:00.000Z",
      },
    ]);
  });

  it("upsertProjectEntry appends a separate entry for a different dream", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await upsertProjectEntry(layout, profile.id, "snake", "snake", {
      now: () => new Date("2026-04-23T00:00:00.000Z"),
    });
    const progress = await upsertProjectEntry(layout, profile.id, "pet-page", "pet-page", {
      now: () => new Date("2026-04-24T00:00:00.000Z"),
    });
    expect(progress.projects.map((p) => p.dreamId)).toEqual(["snake", "pet-page"]);
  });

  it("upsertProjectEntry rejects empty dream id or slug and unknown profile", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await expect(upsertProjectEntry(layout, profile.id, "  ", "snake")).rejects.toThrow(
      /Dream id must not be empty/,
    );
    await expect(upsertProjectEntry(layout, profile.id, "snake", "  ")).rejects.toThrow(
      /Project slug must not be empty/,
    );
    await expect(upsertProjectEntry(layout, "ghost", "snake", "snake")).rejects.toThrow(
      /Profile not found/,
    );
  });

  it("updateProfileSettings persists session target and voice preferences", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const updated = await updateProfileSettings(layout, profile.id, {
      sessionTargetMinutes: 25,
      voicePreferences: "  gentle, loves dinosaurs  ",
    });
    expect(updated.sessionTargetMinutes).toBe(25);
    expect(updated.voicePreferences).toBe("gentle, loves dinosaurs");

    const onDisk = await readProfile(layout, profile.id);
    expect(onDisk?.sessionTargetMinutes).toBe(25);
    expect(onDisk?.voicePreferences).toBe("gentle, loves dinosaurs");
  });

  it("updateProfileSettings clears optional fields when passed null", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await updateProfileSettings(layout, profile.id, {
      sessionTargetMinutes: 30,
      voicePreferences: "bubbly",
    });
    const cleared = await updateProfileSettings(layout, profile.id, {
      sessionTargetMinutes: null,
      voicePreferences: null,
    });
    expect(cleared.sessionTargetMinutes).toBeUndefined();
    expect(cleared.voicePreferences).toBeUndefined();

    const raw = await readFile(join(layout.profilesDir, profile.id, "profile.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.sessionTargetMinutes).toBeUndefined();
    expect(parsed.voicePreferences).toBeUndefined();
  });

  it("updateProfileSettings rejects invalid session targets and missing profiles", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await expect(
      updateProfileSettings(layout, profile.id, { sessionTargetMinutes: 0 }),
    ).rejects.toThrow(/Session target minutes/);
    await expect(
      updateProfileSettings(layout, profile.id, { sessionTargetMinutes: 999 }),
    ).rejects.toThrow(/Session target minutes/);
    await expect(
      updateProfileSettings(layout, profile.id, { sessionTargetMinutes: 1.5 }),
    ).rejects.toThrow(/Session target minutes/);
    await expect(
      updateProfileSettings(layout, "ghost", { sessionTargetMinutes: 20 }),
    ).rejects.toThrow(/Profile not found/);
  });

  it("updateProfileSettings preserves unrelated profile fields", async () => {
    const profile = await createProfile(layout, {
      name: "Ada",
      age: 9,
      interests: ["cats"],
      notes: "Loves colors",
    });
    const updated = await updateProfileSettings(layout, profile.id, {
      sessionTargetMinutes: 15,
    });
    expect(updated.name).toBe(profile.name);
    expect(updated.age).toBe(profile.age);
    expect(updated.interests).toEqual(profile.interests);
    expect(updated.notes).toBe(profile.notes);
    expect(updated.sessions).toEqual(profile.sessions);
    expect(updated.createdAt).toBe(profile.createdAt);
  });

  it("updateProfileSettings persists and trims parent notes", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const updated = await updateProfileSettings(layout, profile.id, {
      notes: "  loves dinosaurs, shy about typing  ",
    });
    expect(updated.notes).toBe("loves dinosaurs, shy about typing");

    const onDisk = await readProfile(layout, profile.id);
    expect(onDisk?.notes).toBe("loves dinosaurs, shy about typing");
  });

  it("updateProfileSettings clears parent notes when passed null or whitespace", async () => {
    const profile = await createProfile(layout, {
      name: "Ada",
      age: 9,
      notes: "Loves colors",
    });
    const clearedByNull = await updateProfileSettings(layout, profile.id, { notes: null });
    expect(clearedByNull.notes).toBeUndefined();

    const reset = await updateProfileSettings(layout, profile.id, { notes: "Loves colors" });
    expect(reset.notes).toBe("Loves colors");

    const clearedByBlank = await updateProfileSettings(layout, profile.id, { notes: "   " });
    expect(clearedByBlank.notes).toBeUndefined();

    const raw = await readFile(join(layout.profilesDir, profile.id, "profile.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.notes).toBeUndefined();
  });

  it("updateProfileSettings persists trimmed + deduped interests", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9, interests: ["cats"] });
    const updated = await updateProfileSettings(layout, profile.id, {
      interests: ["  Space  ", "cats", "CATS", "dinosaurs", "", "   "],
    });
    expect(updated.interests).toEqual(["Space", "cats", "dinosaurs"]);

    const onDisk = await readProfile(layout, profile.id);
    expect(onDisk?.interests).toEqual(["Space", "cats", "dinosaurs"]);
  });

  it("updateProfileSettings updates the name and persists trimmed value", async () => {
    const profile = await createProfile(layout, { name: "Eddei", age: 8 });
    const updated = await updateProfileSettings(layout, profile.id, { name: "  Eddie  " });
    expect(updated.name).toBe("Eddie");
    expect(updated.id).toBe(profile.id);

    const onDisk = await readProfile(layout, profile.id);
    expect(onDisk?.name).toBe("Eddie");
    expect(onDisk?.id).toBe(profile.id);
  });

  it("updateProfileSettings rejects an empty or whitespace-only name", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    await expect(updateProfileSettings(layout, profile.id, { name: "" })).rejects.toThrow(
      /name must not be empty/i,
    );
    await expect(updateProfileSettings(layout, profile.id, { name: "   " })).rejects.toThrow(
      /name must not be empty/i,
    );

    const onDisk = await readProfile(layout, profile.id);
    expect(onDisk?.name).toBe("Ada");
  });

  it("updateProfileSettings updates the age and validates the range", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const updated = await updateProfileSettings(layout, profile.id, { age: 10 });
    expect(updated.age).toBe(10);

    await expect(updateProfileSettings(layout, profile.id, { age: 2 })).rejects.toThrow(
      /age must be an integer between 3 and 18/i,
    );
    await expect(updateProfileSettings(layout, profile.id, { age: 19 })).rejects.toThrow(
      /age must be an integer between 3 and 18/i,
    );
    await expect(updateProfileSettings(layout, profile.id, { age: 8.5 })).rejects.toThrow(
      /age must be an integer between 3 and 18/i,
    );

    const onDisk = await readProfile(layout, profile.id);
    expect(onDisk?.age).toBe(10);
  });

  it("updateProfileSettings clears interests when passed null or empty array", async () => {
    const profile = await createProfile(layout, {
      name: "Ada",
      age: 9,
      interests: ["cats", "space"],
    });
    const clearedByNull = await updateProfileSettings(layout, profile.id, { interests: null });
    expect(clearedByNull.interests).toEqual([]);

    const reset = await updateProfileSettings(layout, profile.id, { interests: ["space"] });
    expect(reset.interests).toEqual(["space"]);

    const clearedByEmpty = await updateProfileSettings(layout, profile.id, { interests: [] });
    expect(clearedByEmpty.interests).toEqual([]);
  });

  it("listProfiles returns profiles ordered by creation time", async () => {
    const older = await createProfile(layout, { name: "First", age: 8 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await createProfile(layout, { name: "Second", age: 11 });
    const list = await listProfiles(layout);
    expect(list.map((p) => p.id)).toEqual([older.id, newer.id]);
  });

  it("deleteProfile removes the profile directory and its contents", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const paths = profilePathsFor(layout, profile.id);
    await deleteProfile(layout, profile.id);
    await expect(readFile(paths.profileFile, "utf8")).rejects.toThrow(/ENOENT/);
    await expect(readFile(paths.stateFile, "utf8")).rejects.toThrow(/ENOENT/);
    await expect(readProfile(layout, profile.id)).resolves.toBeNull();
  });

  it("deleteProfile leaves other profiles intact", async () => {
    const keep = await createProfile(layout, { name: "Keeper", age: 10 });
    const drop = await createProfile(layout, { name: "Dropper", age: 11 });
    await deleteProfile(layout, drop.id);
    const list = await listProfiles(layout);
    expect(list.map((p) => p.id)).toEqual([keep.id]);
  });

  it("deleteProfile is tolerant of a missing profile directory", async () => {
    await expect(deleteProfile(layout, "ghost")).resolves.toBeUndefined();
  });

  it("deleteProfile rejects an empty profile id", async () => {
    await expect(deleteProfile(layout, "  ")).rejects.toThrow(/Profile id must not be empty/);
  });

  it("exportProfile copies the profile dir to a timestamped subdir under destDir", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 9 });
    const destRoot = await mkdtemp(join(tmpdir(), "hi-bit-export-"));
    try {
      const fixedNow = () => new Date("2026-04-23T10:30:00.000Z");
      const exportPath = await exportProfile(layout, profile.id, destRoot, { now: fixedNow });
      expect(exportPath).toBe(join(destRoot, `${profile.id}-2026-04-23T10-30-00-000Z`));
      const exportedProfileJson = await readFile(join(exportPath, "profile.json"), "utf8");
      expect(JSON.parse(exportedProfileJson).id).toBe(profile.id);
      const exportedStateMd = await readFile(join(exportPath, "state.md"), "utf8");
      expect(exportedStateMd).toContain("Ada");
    } finally {
      await rm(destRoot, { recursive: true, force: true });
    }
  });

  it("exportProfile creates destDir if it does not exist", async () => {
    const profile = await createProfile(layout, { name: "Nested", age: 10 });
    const destRoot = await mkdtemp(join(tmpdir(), "hi-bit-export-"));
    try {
      const nested = join(destRoot, "fresh", "exports");
      const exportPath = await exportProfile(layout, profile.id, nested, {
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(exportPath.startsWith(nested)).toBe(true);
      const exportedProfileJson = await readFile(join(exportPath, "profile.json"), "utf8");
      expect(JSON.parse(exportedProfileJson).name).toBe("Nested");
    } finally {
      await rm(destRoot, { recursive: true, force: true });
    }
  });

  it("exportProfile rejects when the profile directory does not exist", async () => {
    const destRoot = await mkdtemp(join(tmpdir(), "hi-bit-export-"));
    try {
      await expect(exportProfile(layout, "ghost", destRoot)).rejects.toThrow(
        /Profile not found: ghost/,
      );
    } finally {
      await rm(destRoot, { recursive: true, force: true });
    }
  });

  it("exportProfile rejects when the target export path already exists", async () => {
    const profile = await createProfile(layout, { name: "Dup", age: 8 });
    const destRoot = await mkdtemp(join(tmpdir(), "hi-bit-export-"));
    try {
      const fixedNow = () => new Date("2026-02-02T02:02:02.000Z");
      const first = await exportProfile(layout, profile.id, destRoot, { now: fixedNow });
      expect(first).toContain(profile.id);
      await expect(exportProfile(layout, profile.id, destRoot, { now: fixedNow })).rejects.toThrow(
        /Export path already exists/,
      );
    } finally {
      await rm(destRoot, { recursive: true, force: true });
    }
  });

  it("exportProfile rejects an empty profile id", async () => {
    const destRoot = await mkdtemp(join(tmpdir(), "hi-bit-export-"));
    try {
      await expect(exportProfile(layout, "  ", destRoot)).rejects.toThrow(
        /Profile id must not be empty/,
      );
    } finally {
      await rm(destRoot, { recursive: true, force: true });
    }
  });

  it("exportProfile rejects an empty destination dir", async () => {
    const profile = await createProfile(layout, { name: "EmptyDest", age: 12 });
    await expect(exportProfile(layout, profile.id, "   ")).rejects.toThrow(
      /Export destination must not be empty/,
    );
  });

  it("exportProfile preserves nested project files", async () => {
    const profile = await createProfile(layout, { name: "Nested", age: 11 });
    const paths = profilePathsFor(layout, profile.id);
    const projectDir = join(paths.projectsDir, "snake");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "index.html"), "<h1>hi</h1>\n", "utf8");
    const destRoot = await mkdtemp(join(tmpdir(), "hi-bit-export-"));
    try {
      const exportPath = await exportProfile(layout, profile.id, destRoot, {
        now: () => new Date("2026-03-03T03:03:03.000Z"),
      });
      const exportedHtml = await readFile(
        join(exportPath, "projects", "snake", "index.html"),
        "utf8",
      );
      expect(exportedHtml).toBe("<h1>hi</h1>\n");
    } finally {
      await rm(destRoot, { recursive: true, force: true });
    }
  });
});
