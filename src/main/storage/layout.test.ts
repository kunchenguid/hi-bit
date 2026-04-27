import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, layoutFor, profilePathsFor } from "./layout";

describe("layoutFor", () => {
  it("assembles all canonical paths under the root", () => {
    const layout = layoutFor("/tmp/fake");
    expect(layout).toEqual({
      root: "/tmp/fake",
      configFile: "/tmp/fake/config.json",
      promptsDir: "/tmp/fake/prompts",
      graphDir: "/tmp/fake/graph",
      graphNodesDir: "/tmp/fake/graph/nodes",
      graphDreamsDir: "/tmp/fake/graph/dreams",
      profilesDir: "/tmp/fake/profiles",
    });
  });
});

describe("profilePathsFor", () => {
  it("resolves every per-kid path under profiles/<id>/", () => {
    const layout = layoutFor("/tmp/fake");
    const paths = profilePathsFor(layout, "ada");
    expect(paths.root).toBe("/tmp/fake/profiles/ada");
    expect(paths.profileFile).toBe("/tmp/fake/profiles/ada/profile.json");
    expect(paths.stateFile).toBe("/tmp/fake/profiles/ada/state.md");
    expect(paths.progressFile).toBe("/tmp/fake/profiles/ada/progress.json");
    expect(paths.agentsFile).toBe("/tmp/fake/profiles/ada/AGENTS.md");
    expect(paths.claudeFile).toBe("/tmp/fake/profiles/ada/CLAUDE.md");
    expect(paths.projectsDir).toBe("/tmp/fake/profiles/ada/projects");
    expect(paths.flagsDir).toBe("/tmp/fake/profiles/ada/flags");
    expect(paths.transcriptsDir).toBe("/tmp/fake/profiles/ada/transcripts");
    expect(paths.sessionLogFile).toBe("/tmp/fake/profiles/ada/session-log.jsonl");
    expect(paths.claudeSettingsDir).toBe("/tmp/fake/profiles/ada/.claude");
    expect(paths.claudeSettingsFile).toBe("/tmp/fake/profiles/ada/.claude/settings.json");
    expect(paths.opencodeConfigFile).toBe("/tmp/fake/profiles/ada/opencode.json");
  });
});

describe("bootstrapLayout", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-layout-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates the full directory tree", async () => {
    const layout = await bootstrapLayout(root);
    for (const dir of [
      layout.promptsDir,
      layout.graphNodesDir,
      layout.graphDreamsDir,
      layout.profilesDir,
    ]) {
      const info = await stat(dir);
      expect(info.isDirectory()).toBe(true);
    }
  });

  it("is idempotent when the tree already exists", async () => {
    await bootstrapLayout(root);
    await expect(bootstrapLayout(root)).resolves.toBeDefined();
  });
});
