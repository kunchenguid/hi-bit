import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDreams } from "./dreams";
import { loadKnowledgeGraph } from "./load";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shippedNodesDir = resolve(__dirname, "../../../graph/nodes");
const shippedDreamsDir = resolve(__dirname, "../../../graph/dreams");

describe("shipped knowledge graph content", () => {
  it("parses and validates without errors", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) {
      throw new Error(`Shipped graph failed to validate: ${JSON.stringify(validation.errors)}`);
    }
    expect(validation.graph.nodes.length).toBeGreaterThan(0);
  });

  it("includes html-doc-shell as a foundations node with no prereqs", async () => {
    const validation = await loadKnowledgeGraph(shippedNodesDir);
    if (!validation.ok) throw new Error("expected ok");
    const shell = validation.graph.byId["html-doc-shell"];
    expect(shell).toBeDefined();
    expect(shell.prereqs).toEqual([]);
    expect(shell.area).toBe("html");
  });

  it("includes run-and-preview as a second foundations node with no prereqs", async () => {
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
    const expected = ["events-click", "events-keydown", "events-input", "events-change"];
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
