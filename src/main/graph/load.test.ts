import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgePoint } from "@shared/knowledgeGraph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadKnowledgeGraph, parseKnowledgePoint, validateGraph } from "./load";

const kpSampleYaml = `id: events-click
title_parent: addEventListener('click', ...)
title_kid: making things happen when you click
area: dom
prereqs: [dom-query-selector, js-functions-define, html-buttons]
introduces: [event-handler, callback-function, dom-event]
mastery_signals:
  saw_it: Bit wrote a click handler.
  did_with_help: Kid wrote it with guidance.
  did_unprompted: Kid added one on their own.
  explained_it: Kid described what happens on click.
`;

function makeKp(overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id: "html-doc-shell",
    title_parent: "HTML document shell",
    title_kid: "the frame that holds your page",
    area: "html",
    prereqs: [],
    introduces: ["doctype", "html-head-body"],
    mastery_signals: {
      saw_it: "seen",
      did_with_help: "helped",
      did_unprompted: "solo",
      explained_it: "spoken",
    },
    ...overrides,
  };
}

describe("parseKnowledgePoint", () => {
  it("parses a complete YAML node", () => {
    const kp = parseKnowledgePoint(kpSampleYaml);
    expect(kp.id).toBe("events-click");
    expect(kp.area).toBe("dom");
    expect(kp.prereqs).toEqual(["dom-query-selector", "js-functions-define", "html-buttons"]);
    expect(kp.introduces).toEqual(["event-handler", "callback-function", "dom-event"]);
    expect(kp.mastery_signals.saw_it).toContain("Bit wrote");
  });

  it("defaults missing prereqs and introduces to empty arrays", () => {
    const yaml = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    const kp = parseKnowledgePoint(yaml);
    expect(kp.prereqs).toEqual([]);
    expect(kp.introduces).toEqual([]);
  });

  it("rejects a non-object top level", () => {
    expect(() => parseKnowledgePoint("just a string")).toThrow(/object/i);
  });

  it("rejects unknown area values", () => {
    const yaml = `id: foo
title_parent: Foo
title_kid: foo
area: quantum
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    expect(() => parseKnowledgePoint(yaml)).toThrow(/area/);
  });

  it("rejects missing required fields", () => {
    const yaml = `id: foo
title_parent: Foo
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    expect(() => parseKnowledgePoint(yaml)).toThrow(/title_kid/);
  });

  it("accepts an optional why_kid field when non-empty", () => {
    const yaml = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
why_kid: every web page needs this wrapper before anything else can show up.
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    const kp = parseKnowledgePoint(yaml);
    expect(kp.why_kid).toBe("every web page needs this wrapper before anything else can show up.");
  });

  it("omits why_kid when not present in the YAML", () => {
    const yaml = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    const kp = parseKnowledgePoint(yaml);
    expect(kp.why_kid).toBeUndefined();
  });

  it("rejects a blank why_kid string", () => {
    const yaml = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
why_kid: "   "
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    expect(() => parseKnowledgePoint(yaml)).toThrow(/why_kid/);
  });

  it("rejects a non-string why_kid", () => {
    const yaml = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
why_kid: 42
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    expect(() => parseKnowledgePoint(yaml)).toThrow(/why_kid/);
  });

  it("rejects missing mastery_signals keys", () => {
    const yaml = `id: foo
title_parent: Foo
title_kid: foo
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
`;
    expect(() => parseKnowledgePoint(yaml)).toThrow(/mastery_signals/);
  });
});

describe("validateGraph", () => {
  it("accepts a consistent DAG and returns indexed nodes", () => {
    const nodes = [
      makeKp({ id: "a" }),
      makeKp({ id: "b", prereqs: ["a"] }),
      makeKp({ id: "c", prereqs: ["a", "b"] }),
    ];
    const result = validateGraph(nodes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.nodes).toHaveLength(3);
      expect(result.graph.byId.b?.prereqs).toEqual(["a"]);
    }
  });

  it("reports duplicate ids", () => {
    const nodes = [makeKp({ id: "a" }), makeKp({ id: "a" })];
    const result = validateGraph(nodes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ kind: "duplicate-id", id: "a" });
    }
  });

  it("reports unresolved prereqs", () => {
    const nodes = [makeKp({ id: "a", prereqs: ["ghost"] })];
    const result = validateGraph(nodes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({
        kind: "unresolved-prereq",
        id: "a",
        prereq: "ghost",
      });
    }
  });

  it("reports a direct cycle", () => {
    const nodes = [makeKp({ id: "a", prereqs: ["b"] }), makeKp({ id: "b", prereqs: ["a"] })];
    const result = validateGraph(nodes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cycle = result.errors.find((e) => e.kind === "cycle");
      expect(cycle).toBeDefined();
    }
  });

  it("reports a longer cycle", () => {
    const nodes = [
      makeKp({ id: "a", prereqs: ["c"] }),
      makeKp({ id: "b", prereqs: ["a"] }),
      makeKp({ id: "c", prereqs: ["b"] }),
    ];
    const result = validateGraph(nodes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const cycle = result.errors.find((e) => e.kind === "cycle");
      expect(cycle).toBeDefined();
    }
  });
});

describe("loadKnowledgeGraph", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hi-bit-graph-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads all .yml files in a directory and validates the graph", async () => {
    const rootYaml = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
area: html
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    const childYaml = `id: html-text-paragraphs
title_parent: Paragraphs
title_kid: regular text
area: html
prereqs: [html-doc-shell]
mastery_signals:
  saw_it: s
  did_with_help: d
  did_unprompted: u
  explained_it: e
`;
    await writeFile(join(dir, "html-doc-shell.yml"), rootYaml, "utf8");
    await writeFile(join(dir, "html-text-paragraphs.yml"), childYaml, "utf8");
    await writeFile(join(dir, "README.md"), "not a node", "utf8");

    const result = await loadKnowledgeGraph(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.nodes.map((n) => n.id).sort()).toEqual([
        "html-doc-shell",
        "html-text-paragraphs",
      ]);
    }
  });

  it("returns an empty graph when the directory has no yml files", async () => {
    const result = await loadKnowledgeGraph(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.nodes).toEqual([]);
    }
  });

  it("surfaces parse errors with the offending filename", async () => {
    await writeFile(join(dir, "broken.yml"), "id: foo\narea: nope\n", "utf8");
    await expect(loadKnowledgeGraph(dir)).rejects.toThrow(/broken\.yml/);
  });
});
