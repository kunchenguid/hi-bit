import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDreams, parseDream, validateDreams } from "./dreams";

const dreamSampleYaml = `id: snake
title_parent: Snake
title_kid: snake game
summary_kid: a snake that grows when it eats fruit
emoji: "🐍"
categories: [arcade]
interest_tags: [games, animals]
requires:
  - canvas-setup
  - canvas-keyboard-move
  - state-counter
style_hints:
  - snake color
  - fruit shape
`;

function makeKp(id: string): KnowledgePoint {
  return {
    id,
    title_parent: id,
    title_kid: id,
    area: "html",
    prereqs: [],
    introduces: [],
    mastery_signals: {
      saw_it: "s",
      did_with_help: "d",
      did_unprompted: "u",
      explained_it: "e",
    },
  };
}

function graphOf(ids: string[]): KnowledgeGraph {
  const nodes = ids.map(makeKp);
  return { nodes, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

function makeDream(overrides: Partial<Dream> = {}): Dream {
  return {
    id: "pet-page",
    title_parent: "Pet page",
    title_kid: "pet page",
    summary_kid: "a page about your pet",
    categories: ["personal"],
    interest_tags: ["animals"],
    requires: ["html-doc-shell"],
    style_hints: [],
    emoji: "🐶",
    ...overrides,
  };
}

describe("parseDream", () => {
  it("parses a complete YAML dream", () => {
    const dream = parseDream(dreamSampleYaml);
    expect(dream.id).toBe("snake");
    expect(dream.emoji).toBe("🐍");
    expect(dream.categories).toEqual(["arcade"]);
    expect(dream.interest_tags).toEqual(["games", "animals"]);
    expect(dream.requires).toEqual(["canvas-setup", "canvas-keyboard-move", "state-counter"]);
    expect(dream.style_hints).toEqual(["snake color", "fruit shape"]);
  });

  it("defaults missing optional arrays to empty", () => {
    const yaml = `id: blank
title_parent: Blank
title_kid: blank
summary_kid: a blank dream
emoji: "📄"
categories: [creative]
requires: [html-doc-shell]
`;
    const dream = parseDream(yaml);
    expect(dream.interest_tags).toEqual([]);
    expect(dream.style_hints).toEqual([]);
  });

  it("rejects a missing emoji", () => {
    const yaml = `id: snake
title_parent: Snake
title_kid: snake
summary_kid: summary
categories: [arcade]
requires: [canvas-setup]
`;
    expect(() => parseDream(yaml)).toThrow(/emoji/);
  });

  it("rejects a non-object top level", () => {
    expect(() => parseDream("just a string")).toThrow(/object/i);
  });

  it("rejects unknown categories", () => {
    const yaml = `id: snake
title_parent: Snake
title_kid: snake
summary_kid: summary
emoji: "🐍"
categories: [mystery]
requires: [canvas-setup]
`;
    expect(() => parseDream(yaml)).toThrow(/categories/);
  });

  it("rejects missing required fields", () => {
    const yaml = `id: snake
title_parent: Snake
emoji: "🐍"
categories: [arcade]
requires: [canvas-setup]
`;
    expect(() => parseDream(yaml)).toThrow(/title_kid/);
  });

  it("rejects a non-array categories value", () => {
    const yaml = `id: snake
title_parent: Snake
title_kid: snake
summary_kid: summary
emoji: "🐍"
categories: arcade
requires: [canvas-setup]
`;
    expect(() => parseDream(yaml)).toThrow(/categories/);
  });
});

describe("validateDreams", () => {
  it("accepts a consistent library and indexes dreams by id", () => {
    const graph = graphOf(["html-doc-shell", "canvas-setup"]);
    const dreams = [
      makeDream({ id: "a", requires: ["html-doc-shell"] }),
      makeDream({ id: "b", requires: ["canvas-setup"] }),
    ];
    const result = validateDreams(dreams, graph);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.library.dreams).toHaveLength(2);
      expect(result.library.byId.a?.requires).toEqual(["html-doc-shell"]);
    }
  });

  it("reports duplicate ids", () => {
    const graph = graphOf(["html-doc-shell"]);
    const dreams = [makeDream({ id: "a" }), makeDream({ id: "a" })];
    const result = validateDreams(dreams, graph);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ kind: "duplicate-id", id: "a" });
    }
  });

  it("reports unresolved requires against the KP graph", () => {
    const graph = graphOf(["html-doc-shell"]);
    const dreams = [makeDream({ id: "a", requires: ["ghost-kp"] })];
    const result = validateDreams(dreams, graph);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        kind: "unresolved-requires",
        id: "a",
        prereq: "ghost-kp",
      });
    }
  });

  it("reports empty categories and empty requires", () => {
    const graph = graphOf(["html-doc-shell"]);
    const dreams = [makeDream({ id: "a", categories: [], requires: [] })];
    const result = validateDreams(dreams, graph);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ kind: "empty-categories", id: "a" });
      expect(result.errors).toContainEqual({ kind: "empty-requires", id: "a" });
    }
  });
});

describe("loadDreams", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hi-bit-dreams-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads all .yml files in a directory and validates against the graph", async () => {
    const graph = graphOf(["html-doc-shell", "canvas-setup"]);
    const petYaml = `id: pet-page
title_parent: Pet page
title_kid: pet page
summary_kid: a page about your pet
emoji: "🐶"
categories: [personal]
requires: [html-doc-shell]
`;
    const snakeYaml = `id: snake
title_parent: Snake
title_kid: snake game
summary_kid: a snake that grows
emoji: "🐍"
categories: [arcade]
requires: [canvas-setup]
`;
    await writeFile(join(dir, "pet-page.yml"), petYaml, "utf8");
    await writeFile(join(dir, "snake.yml"), snakeYaml, "utf8");
    await writeFile(join(dir, "README.md"), "not a dream", "utf8");

    const result = await loadDreams(dir, graph);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.library.dreams.map((d) => d.id).sort()).toEqual(["pet-page", "snake"]);
    }
  });

  it("returns an empty library when the directory has no yml files", async () => {
    const graph = graphOf([]);
    const result = await loadDreams(dir, graph);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.library.dreams).toEqual([]);
    }
  });

  it("returns an empty library when the directory does not exist", async () => {
    const graph = graphOf([]);
    const missing = join(dir, "does-not-exist");
    const result = await loadDreams(missing, graph);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.library.dreams).toEqual([]);
    }
  });

  it("surfaces parse errors with the offending filename", async () => {
    const graph = graphOf([]);
    await writeFile(join(dir, "broken.yml"), "id: foo\ncategories: nope\n", "utf8");
    await expect(loadDreams(dir, graph)).rejects.toThrow(/broken\.yml/);
  });
});
