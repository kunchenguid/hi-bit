import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBitSystemPrompt,
  buildWorkerSystemPrompt,
  createResourceLoader,
  createWorkerResourceLoader,
} from "./piResources";

describe("createResourceLoader", () => {
  it("returns only app-owned resources and no third-party package resources", async () => {
    const loader = createResourceLoader("System prompt");
    await loader.reload();

    expect(loader.getSystemPrompt()).toBe("System prompt");
    expect(loader.getAppendSystemPrompt()).toEqual([]);
    expect(loader.getExtensions().extensions).toEqual([]);
    expect(loader.getExtensions().errors).toEqual([]);
    expect(loader.getSkills()).toEqual({ skills: [], diagnostics: [] });
    expect(loader.getPrompts()).toEqual({ prompts: [], diagnostics: [] });
    expect(loader.getThemes()).toEqual({ themes: [], diagnostics: [] });
    expect(loader.getAgentsFiles()).toEqual({ agentsFiles: [] });
  });
});

describe("createWorkerResourceLoader skills", () => {
  it("loads the bundled game-assets skill from a skillsDir", () => {
    const loader = createWorkerResourceLoader(undefined, { skillsDir: resolve("skills") });
    const { skills } = loader.getSkills();
    const skill = skills.find((s) => s.name === "game-assets");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/sprite|animation/i);
  });

  it("loads the bundled create-2d-game skill from a skillsDir", () => {
    const loader = createWorkerResourceLoader(undefined, { skillsDir: resolve("skills") });
    const { skills } = loader.getSkills();
    const skill = skills.find((s) => s.name === "create-2d-game");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/game|loop|platformer/i);
  });

  it("loads the bundled create-3d-game skill from a skillsDir", () => {
    const loader = createWorkerResourceLoader(undefined, { skillsDir: resolve("skills") });
    const { skills } = loader.getSkills();
    const skill = skills.find((s) => s.name === "create-3d-game");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/3d|three|world/i);
  });

  it("exposes no skills when no skillsDir is given", () => {
    expect(createWorkerResourceLoader().getSkills()).toEqual({ skills: [], diagnostics: [] });
  });
});

describe("buildWorkerSystemPrompt", () => {
  it("describes a worker bot building in an isolated workbench", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toContain("worker bot");
    expect(prompt).toContain("isolated Workbench");
    expect(prompt).toContain("small visible changes");
    expect(prompt).toContain("Ask one short question");
    expect(prompt).not.toMatch(/curriculum|knowledge point|dream|mastery/i);
  });

  it("forbids code-drawn sprite art and points animated art at the game-assets skill", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toMatch(/PIL|Pillow/);
    expect(prompt).toMatch(/never|must/i);
    expect(prompt).toContain("game-assets skill");
    expect(prompt).toContain("process_sprite_sheet");
  });

  it("points 2D and 3D playable game builds at their skills", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toContain("create-2d-game skill");
    expect(prompt).toContain("create-3d-game skill");
    expect(prompt).toMatch(/game loop|platformer|playable game/i);
    expect(prompt).toMatch(/3d|first-person|third-person/i);
  });

  it("tells the worker to tag a finished playable build with READY_TO_PLAY", () => {
    expect(buildWorkerSystemPrompt()).toContain("[[READY_TO_PLAY]]");
  });

  it("offers the web tools for looking things up while keeping the builder's details private", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toContain("web_search");
    expect(prompt).toContain("fetch_content");
    expect(prompt).toMatch(/look (it|something|things) up|docs|reference/i);
    expect(prompt).toMatch(/personal|private|name|details/i);
  });
});

describe("buildBitSystemPrompt", () => {
  it("frames Bit as the portfolio-holding partner who confirms and delegates by default", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toContain("You are Bit");
    expect(prompt).toContain("delegate_build");
    expect(prompt).toContain("create_creation");
    expect(prompt).toContain("confirmed: true");
    expect(prompt).not.toMatch(/studio/i);
  });

  it("lets Bit make tiny one-file tweaks directly with its own edit tools", () => {
    const prompt = buildBitSystemPrompt();

    // The whole point of this change: Bit is no longer forbidden from editing.
    expect(prompt).not.toContain("never write code");
    expect(prompt).toContain("edit");
    expect(prompt).toMatch(/tiny|trivial|one file|single/i);
    // Anything bigger or uncertain still goes to a helper.
    expect(prompt).toMatch(/delegate_build/);
  });

  it("forbids Bit from editing a creation that is currently building, and from making art directly", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toMatch(/currently building|while a (worker|helper) is/i);
    expect(prompt).toMatch(/art|picture|sprite/i);
  });

  it("tells Bit where creation files live so direct edits hit the right place", () => {
    expect(buildBitSystemPrompt()).toContain("main-workbench");
  });
});
