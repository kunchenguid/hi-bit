import { describe, expect, it } from "vitest";
import {
  buildMayorSystemPrompt,
  buildWorkerSystemPrompt,
  createResourceLoader,
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

describe("buildWorkerSystemPrompt", () => {
  it("describes a worker bot building in an isolated workbench", () => {
    const prompt = buildWorkerSystemPrompt();

    expect(prompt).toContain("worker bot");
    expect(prompt).toContain("isolated Workbench");
    expect(prompt).toContain("small visible changes");
    expect(prompt).toContain("Ask one short question");
    expect(prompt).not.toMatch(/curriculum|knowledge point|dream|mastery/i);
  });
});

describe("buildMayorSystemPrompt", () => {
  it("frames Bit as the portfolio-holding partner who confirms and delegates", () => {
    const prompt = buildMayorSystemPrompt();

    expect(prompt).toContain("You are Bit");
    expect(prompt).toContain("delegate_build");
    expect(prompt).toContain("create_creation");
    expect(prompt).toContain("confirmed: true");
    expect(prompt).toContain("never write code");
    expect(prompt).not.toMatch(/studio/i);
  });
});
