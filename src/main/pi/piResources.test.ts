import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBitSystemPrompt,
  buildBotSystemPrompt,
  createBotResourceLoader,
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

describe("createBotResourceLoader skills", () => {
  it("loads the bundled game-assets skill from a skillsDir", () => {
    const loader = createBotResourceLoader(undefined, { skillsDir: resolve("skills") });
    const { skills } = loader.getSkills();
    const skill = skills.find((s) => s.name === "game-assets");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/sprite|animation/i);
  });

  it("loads the bundled create-2d-game skill from a skillsDir", () => {
    const loader = createBotResourceLoader(undefined, { skillsDir: resolve("skills") });
    const { skills } = loader.getSkills();
    const skill = skills.find((s) => s.name === "create-2d-game");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/game|loop|platformer/i);
  });

  it("loads the bundled create-3d-game skill from a skillsDir", () => {
    const loader = createBotResourceLoader(undefined, { skillsDir: resolve("skills") });
    const { skills } = loader.getSkills();
    const skill = skills.find((s) => s.name === "create-3d-game");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/3d|three|world/i);
  });

  it("exposes no skills when no skillsDir is given", () => {
    expect(createBotResourceLoader().getSkills()).toEqual({ skills: [], diagnostics: [] });
  });
});

describe("buildBotSystemPrompt", () => {
  it("describes a bot building in an isolated workbench", () => {
    const prompt = buildBotSystemPrompt();

    expect(prompt).toContain("a bot inside Hi-Bit");
    expect(prompt).toContain("isolated Workbench");
    expect(prompt).toContain("small visible changes");
    expect(prompt).toContain("Ask one short question");
    expect(prompt).not.toMatch(/curriculum|knowledge point|dream|mastery/i);
  });

  it("forbids code-drawn sprite art and points animated art at the game-assets skill", () => {
    const prompt = buildBotSystemPrompt();

    expect(prompt).toMatch(/PIL|Pillow/);
    expect(prompt).toMatch(/never|must/i);
    expect(prompt).toContain("game-assets skill");
    expect(prompt).toContain("process_sprite_sheet");
  });

  it("points 2D and 3D playable game builds at their skills", () => {
    const prompt = buildBotSystemPrompt();

    expect(prompt).toContain("create-2d-game skill");
    expect(prompt).toContain("create-3d-game skill");
    expect(prompt).toMatch(/game loop|platformer|playable game/i);
    expect(prompt).toMatch(/3d|first-person|third-person/i);
  });

  it("tells the bot to tag a finished playable build with READY_TO_PLAY", () => {
    expect(buildBotSystemPrompt()).toContain("[[READY_TO_PLAY]]");
  });

  it("offers the web tools for looking things up while keeping the builder's details private", () => {
    const prompt = buildBotSystemPrompt();

    expect(prompt).toContain("web_search");
    expect(prompt).toContain("fetch_content");
    expect(prompt).toMatch(/look (it|something|things) up|docs|reference/i);
    expect(prompt).toMatch(/personal|private|name|details/i);
  });

  it("prefers full-viewport creation layouts unless the creation needs scrolling", () => {
    const prompt = buildBotSystemPrompt();

    expect(prompt).toContain("100vw");
    expect(prompt).toContain("100vh");
    expect(prompt).toMatch(/no scrolling or overflow/i);
    expect(prompt).toMatch(/unless.*different layout/i);
  });

  it("gives the bot Bit's brand spec and points Bit-art at view_bit", () => {
    const runtimePrompt = buildBotSystemPrompt();
    const mirroredPrompt = readFileSync(resolve("prompts/bot.md"), "utf8");

    for (const prompt of [runtimePrompt, mirroredPrompt]) {
      // The bot knows Bit is the mascot and what colours stay on-model...
      expect(prompt).toMatch(/desktop-computer robot/i);
      expect(prompt).toContain("#2EC4F1");
      // ...and reaches for the real picture before drawing Bit.
      expect(prompt).toContain("view_bit");
    }
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
    // Anything bigger or uncertain still goes to a bot.
    expect(prompt).toMatch(/delegate_build/);
  });

  it("forbids Bit from editing a creation that is currently building, and from making art directly", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toMatch(/currently building|while a bot is/i);
    expect(prompt).toMatch(/art|picture|sprite/i);
  });

  it("tells Bit where creation files live so direct edits hit the right place", () => {
    expect(buildBitSystemPrompt()).toContain("main-workbench");
  });

  it("offers Bit the web tools for looking things up while keeping the builder's details private", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toContain("web_search");
    expect(prompt).toContain("fetch_content");
    expect(prompt).toContain("get_search_content");
    expect(prompt).toMatch(/look something up|docs|reference/i);
    expect(prompt).toMatch(/personal|private|name|details/i);
  });

  it("tells Bit to treat web results as untrusted reference material", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toMatch(/web.*untrusted|untrusted.*web/i);
    expect(prompt).toMatch(/reference material/i);
    expect(prompt).toMatch(/must never override|never override/i);
    expect(prompt).toMatch(/tool calls?/i);
  });

  it("prefers full-viewport creation layouts for direct page edits unless the creation needs scrolling", () => {
    const prompt = buildBitSystemPrompt();

    expect(prompt).toContain("100vw");
    expect(prompt).toContain("100vh");
    expect(prompt).toMatch(/no scrolling or overflow/i);
    expect(prompt).toMatch(/unless.*different layout/i);
  });

  it("tells Bit what it looks like and offers view_bit to see its own mascot", () => {
    const runtimePrompt = buildBitSystemPrompt();
    const mirroredPrompt = readFileSync(resolve("prompts/bit.md"), "utf8");

    for (const prompt of [runtimePrompt, mirroredPrompt]) {
      // Bit can answer "what do you look like?" from a verbal self-description...
      expect(prompt).toMatch(/desktop-computer robot/i);
      expect(prompt).toMatch(/cyan/i);
      expect(prompt).toMatch(/antenna/i);
      // ...and can pull up its own picture when it wants to actually look.
      expect(prompt).toContain("view_bit");
    }
  });

  it("offers view_screen in both Bit prompt sources for visual app questions", () => {
    const runtimePrompt = buildBitSystemPrompt();
    const mirroredPrompt = readFileSync(resolve("prompts/bit.md"), "utf8");

    for (const prompt of [runtimePrompt, mirroredPrompt]) {
      expect(prompt).toContain("view_screen");
      expect(prompt).toMatch(/whole Hi-Bit screen|whole.*screen/i);
      expect(prompt).toMatch(/builder.*see|what they see/i);
      expect(prompt).toMatch(/looks weird|wrong place|look like this|visual/i);
    }
  });

  it("gates inside words through the per-turn Words-you-may-use note, not by scrubbing the prompt", () => {
    const runtimePrompt = buildBitSystemPrompt();
    const mirroredPrompt = readFileSync(resolve("prompts/bit.md"), "utf8");

    // The prompt names the bot plainly (it is the canonical word); the only gate
    // is the per-turn note telling Bit which inside words the kid has unlocked.
    expect(runtimePrompt).toMatch(/\bbot\b/i);
    expect(runtimePrompt).toMatch(/Words you may use/);
    expect(runtimePrompt).toMatch(/only ever say an inside word/i);
    expect(mirroredPrompt).toMatch(/\bbot\b/i);
    expect(mirroredPrompt).toMatch(/Words you may use/);
  });
});
