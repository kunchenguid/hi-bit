import { describe, expect, it } from "vitest";
import { buildHiBitSystemPrompt, createHiBitResourceLoader } from "./piResources";

describe("createHiBitResourceLoader", () => {
  it("returns only app-owned resources and no third-party package resources", async () => {
    const loader = createHiBitResourceLoader("System prompt");
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

describe("buildHiBitSystemPrompt", () => {
  it("describes a Bot worker dispatched by Bit instead of a curriculum scheduler", () => {
    const prompt = buildHiBitSystemPrompt();

    expect(prompt).toContain("Bot working for Bit");
    expect(prompt).toContain("isolated Workbench");
    expect(prompt).toContain("small visible changes");
    expect(prompt).toContain("Ask one short question");
    expect(prompt).not.toMatch(/curriculum|knowledge point|dream|mastery/i);
  });
});
