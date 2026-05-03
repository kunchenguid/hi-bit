import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDreams } from "./dreams";
import { loadKnowledgeGraph } from "./load";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shippedNodesDir = resolve(__dirname, "../../../graph/nodes");
const shippedDreamsDir = resolve(__dirname, "../../../graph/dreams");

describe("shipped knowledge graph content", () => {
  function depthOf(id: string, byId: Record<string, { prereqs: string[] }>): number {
    const node = byId[id];
    if (!node || node.prereqs.length === 0) return 0;
    return 1 + Math.max(...node.prereqs.map((prereq) => depthOf(prereq, byId)));
  }

  it("parses and validates without errors", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) {
      throw new Error(`Shipped graph failed to validate: ${JSON.stringify(validation.errors)}`);
    }
    expect(validation.graph.nodes.length).toBeGreaterThan(0);
  });

  it("starts zero-knowledge kids with the preview loop before code concepts", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const roots = validation.graph.nodes.filter((node) => node.prereqs.length === 0);
    expect(roots.map((node) => node.id)).toEqual(["run-and-preview"]);
  });

  it("ramps HTML through page parts, tags, visible body content, and attributes", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    expect(validation.graph.byId["web-page-parts"]?.prereqs).toEqual(["run-and-preview"]);
    expect(validation.graph.byId["html-tags-basics"]?.prereqs).toEqual(["web-page-parts"]);
    expect(validation.graph.byId["html-page-body"]?.prereqs).toEqual(["html-tags-basics"]);
    expect(validation.graph.byId["html-attributes-basics"]?.prereqs).toEqual(["html-page-body"]);
    expect(validation.graph.byId["html-doc-shell"]?.prereqs).toEqual(["html-head-title"]);
  });

  it("keeps click interactivity reachable before full branching and reusable functions", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    expect(validation.graph.byId["events-click"]?.prereqs).toEqual([
      "dom-query-selector",
      "event-callback-basics",
      "html-buttons",
    ]);
    expect(depthOf("events-click", validation.graph.byId)).toBeLessThan(
      depthOf("js-functions-define", validation.graph.byId),
    );
  });

  it("includes html-doc-shell after visible page basics", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const shell = validation.graph.byId["html-doc-shell"];
    expect(shell).toBeDefined();
    expect(shell.prereqs).toEqual(["html-head-title"]);
    expect(shell.area).toBe("html");
  });

  it("includes run-and-preview as the foundations node with no prereqs", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const preview = validation.graph.byId["run-and-preview"];
    expect(preview).toBeDefined();
    expect(preview.prereqs).toEqual([]);
  });

  it("covers the full v1 HTML node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "web-page-parts",
      "html-tags-basics",
      "html-page-body",
      "html-head-title",
      "html-attributes-basics",
      "html-id-attribute",
      "html-doc-shell",
      "html-text-headings",
      "html-text-paragraphs",
      "html-lists",
      "html-links",
      "html-images",
      "html-div-span",
      "html-buttons",
      "html-inputs-text",
      "html-inputs-number",
      "html-inputs-checkbox-radio",
      "html-labels",
      "html-id-class",
      "html-comments",
    ];
    for (const id of expected) {
      expect(validation.graph.byId[id], `missing KP ${id}`).toBeDefined();
    }
  });

  it("covers the full v1 CSS node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "css-attach",
      "css-rule-basics",
      "css-selectors-element",
      "css-selectors-class-id",
      "css-colors",
      "css-text-font",
      "css-background",
      "css-box-model",
      "css-border-radius",
      "css-width-height",
      "css-display-block-inline",
      "css-flex-basics",
      "css-grid-basics",
      "css-position-absolute",
      "css-hover",
      "css-transitions",
      "css-transforms",
      "css-opacity",
    ];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
      expect(kp.area, `KP ${id} should be area=css`).toBe("css");
    }
  });

  it("covers the full v1 JavaScript core node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "js-attach",
      "js-instructions-basics",
      "js-function-call-basics",
      "js-console-log",
      "js-variables-let-const",
      "js-strings",
      "js-numbers",
      "js-booleans",
      "js-template-literals",
      "js-arrays",
      "js-array-push",
      "js-array-length",
      "js-objects",
      "js-comparison",
      "js-logic",
      "js-if-else",
      "js-for-loop",
      "js-for-of",
      "js-while-loop",
      "js-functions-define",
      "js-function-params",
      "js-function-return",
      "js-math-random",
      "js-comments",
    ];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
      expect(kp.area, `KP ${id} should be area=js`).toBe("js");
    }
  });

  it("covers the full v1 DOM node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "dom-page-tree-basics",
      "dom-query-selector",
      "dom-text-content",
      "dom-change-style",
      "dom-class-toggle",
      "dom-set-attribute",
      "dom-create-append",
      "dom-input-value",
    ];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
      expect(kp.area, `KP ${id} should be area=dom`).toBe("dom");
    }
  });

  it("covers the full v1 Events node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "event-callback-basics",
      "events-click",
      "events-keydown",
      "events-input",
      "events-change",
    ];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
      expect(kp.area, `KP ${id} should be area=dom`).toBe("dom");
    }
  });

  it("covers the full v1 Interactivity patterns node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "state-counter",
      "state-toggle",
      "state-array-in-dom",
      "timers-setinterval",
      "timers-settimeout",
      "animation-raf",
      "storage-localstorage",
    ];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
      expect(kp.area, `KP ${id} should be area=interactivity`).toBe("interactivity");
    }
  });

  it("covers the full v1 Canvas node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = [
      "canvas-setup",
      "canvas-fillrect",
      "canvas-clear",
      "canvas-circle",
      "canvas-text",
      "canvas-keyboard-move",
      "canvas-collision-bounds",
      "canvas-collision-rect",
    ];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
      expect(kp.area, `KP ${id} should be area=canvas`).toBe("canvas");
    }
  });

  it("covers the full v1 Project-level mechanics node set from docs/knowledge-graph.md", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const expected = ["project-game-loop", "project-score", "project-reset"];
    for (const id of expected) {
      const kp = validation.graph.byId[id];
      expect(kp, `missing KP ${id}`).toBeDefined();
    }
    expect(validation.graph.byId["project-game-loop"].area).toBe("canvas");
    expect(validation.graph.byId["project-score"].area).toBe("interactivity");
    expect(validation.graph.byId["project-reset"].area).toBe("interactivity");
  });
});

describe("shipped dream library content", () => {
  it("parses and validates against the shipped KP graph", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) {
      throw new Error(
        `Shipped dreams failed to validate: ${JSON.stringify(dreamValidation.errors)}`,
      );
    }
    expect(dreamValidation.library.dreams.length).toBeGreaterThan(0);
  });

  it("every shipped dream's requires resolve to shipped KP ids", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    for (const dream of dreamValidation.library.dreams) {
      expect(dream.requires.length).toBeGreaterThan(0);
      for (const req of dream.requires) {
        expect(graphValidation.graph.byId[req]).toBeDefined();
      }
    }
  });

  it("includes hello-card, pet-page, and click-me starter dreams", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    expect(dreamValidation.library.byId["hello-card"]).toBeDefined();
    expect(dreamValidation.library.byId["pet-page"]).toBeDefined();
    expect(dreamValidation.library.byId["click-me"]).toBeDefined();
  });

  it("includes starter and bridge dreams for the revised zero-knowledge ramp", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    const expected = [
      "show-me-around",
      "web-page-map",
      "tag-sandwich",
      "page-frame",
      "first-heading",
      "tiny-poster",
      "emoji-button",
      "style-rule-practice",
      "message-button",
      "type-mirror",
      "random-picker",
      "canvas-rectangle",
    ];
    for (const id of expected) {
      expect(dreamValidation.library.byId[id], `missing dream ${id}`).toBeDefined();
    }
  });

  it("spreads shipped dreams across beginner, middle, and advanced difficulties", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    const byDifficulty = new Map<number, number>();
    for (const dream of dreamValidation.library.dreams) {
      byDifficulty.set(dream.difficulty, (byDifficulty.get(dream.difficulty) ?? 0) + 1);
    }
    expect(byDifficulty.get(1) ?? 0).toBeGreaterThanOrEqual(1);
    expect(byDifficulty.get(2) ?? 0).toBeGreaterThanOrEqual(2);
    expect(byDifficulty.get(3) ?? 0).toBeGreaterThanOrEqual(4);
    expect(byDifficulty.get(4) ?? 0).toBeGreaterThanOrEqual(4);
    expect(byDifficulty.get(5) ?? 0).toBeLessThan(36);
  });

  it("only the explicit page-frame dream directly requires the full HTML shell", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    const shellDreams = dreamValidation.library.dreams
      .filter((dream) => dream.requires.includes("html-doc-shell"))
      .map((dream) => dream.id)
      .sort();
    expect(shellDreams).toEqual(["page-frame"]);
  });

  it("keeps dream requirements aligned with kid-facing summaries", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    expect(dreamValidation.library.byId["pet-page"].requires).toContain("html-images");
    expect(dreamValidation.library.byId["pet-page"].requires).not.toContain("html-comments");
    expect(dreamValidation.library.byId["birthday-card"].requires).toContain("css-colors");
    expect(dreamValidation.library.byId["style-card"].requires).toContain("css-text-font");
    expect(dreamValidation.library.byId["bouncing-ball"].requires).toContain("canvas-circle");
  });

  it("does not ask kids to type emoji for the smiley-face button dream", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    const dream = dreamValidation.library.byId["emoji-button"];
    expect(dream).toBeDefined();
    expect(dream.title_kid).toBe("a button with a smiley face");
    expect(dream.summary_kid).toBe(
      "make a page with a button that uses a smiley you can type, like :) or :D, plus a label you choose",
    );
    const kidFacingText = [
      dream.title_kid,
      dream.summary_kid,
      ...dream.interest_tags,
      ...dream.style_hints,
    ].join("\n");
    expect(kidFacingText).not.toMatch(/emoji/i);
    expect(kidFacingText).toMatch(/smiley/i);
  });

  it("covers the expanded v1 dream library spanning all five categories", async () => {
    const graphValidation = await loadKnowledgeGraph(shippedNodesDir);
    if (!graphValidation.ok) throw new Error("expected graph to validate");
    const dreamValidation = await loadDreams(shippedDreamsDir, graphValidation.graph);
    if (!dreamValidation.ok) throw new Error("expected dreams to validate");
    const expected = [
      "hello-card",
      "pet-page",
      "click-me",
      "birthday-card",
      "story-page",
      "favorite-things",
      "about-me",
      "style-card",
      "sticker-gallery",
      "click-counter",
      "color-changer",
      "name-badge",
      "doodle-pad",
      "secret-message",
      "dice-roller",
      "magic-answer",
      "to-do-list",
      "flashcards",
      "stopwatch",
      "hover-gallery",
      "bouncing-ball",
      "reaction-timer",
      "pixel-painter",
      "snake",
      "pong",
      "quiz",
      "typing-game",
      "family-page",
      "traffic-light",
      "memory-match",
      "beat-pad",
      "rock-paper-scissors",
      "guess-the-number",
      "sticky-note",
      "pizza-maker",
      "trading-cards",
      "click-rush",
      "mad-libs",
      "starry-sky",
      "photo-scrapbook",
      "show-me-around",
      "web-page-map",
      "tag-sandwich",
      "page-frame",
      "first-heading",
      "tiny-poster",
      "emoji-button",
      "style-rule-practice",
      "message-button",
      "type-mirror",
      "random-picker",
      "canvas-rectangle",
    ];
    for (const id of expected) {
      expect(dreamValidation.library.byId[id], `missing dream ${id}`).toBeDefined();
    }
    const allCategories = new Set<string>();
    for (const dream of dreamValidation.library.dreams) {
      for (const cat of dream.categories) allCategories.add(cat);
    }
    for (const cat of ["arcade", "creative", "personal", "utility", "art"]) {
      expect(allCategories.has(cat), `category ${cat} missing from library`).toBe(true);
    }
  });
});
