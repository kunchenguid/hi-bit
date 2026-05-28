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

  it("tells the worker to tag a finished playable build with READY_TO_PLAY", () => {
    expect(buildWorkerSystemPrompt()).toContain("[[READY_TO_PLAY]]");
  });
});

describe("buildBitSystemPrompt", () => {
  it("frames Bit as the portfolio-holding partner who confirms and delegates", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toContain("You are Bit");
    expect(prompt).toContain("delegate_build");
    expect(prompt).toContain("create_creation");
    expect(prompt).toContain("confirmed: true");
    expect(prompt).toContain("never write code");
    expect(prompt).not.toMatch(/studio/i);
  });
});
