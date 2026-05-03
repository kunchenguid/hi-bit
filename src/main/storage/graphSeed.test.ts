import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadKnowledgeGraph } from "../graph/load";
import { seedGraph } from "./graphSeed";
import { bootstrapLayout, type HiBitLayout } from "./layout";

const KP_YAML = `id: html-doc-shell
title_parent: HTML document shell
title_kid: the frame that holds your page
area: html
prereqs: []
introduces: [doctype]
mastery_signals:
  saw_it: Bit wrote the shell.
  did_with_help: Kid filled it in.
  did_unprompted: Kid started a new page with a shell.
  explained_it: Kid described the shell.
`;

describe("seedGraph", () => {
  let hiBitRoot: string;
  let layout: HiBitLayout;
  let sourceRoot: string;
  let sourceGraph: string;

  beforeEach(async () => {
    hiBitRoot = await mkdtemp(join(tmpdir(), "hi-bit-graph-"));
    layout = await bootstrapLayout(hiBitRoot);
    sourceRoot = await mkdtemp(join(tmpdir(), "hi-bit-graph-src-"));
    sourceGraph = join(sourceRoot, "graph");
    await mkdir(join(sourceGraph, "nodes"), { recursive: true });
    await mkdir(join(sourceGraph, "dreams"), { recursive: true });
  });

  afterEach(async () => {
    await rm(hiBitRoot, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  });

  it("copies .yml files from source nodes dir into layout.graphNodesDir", async () => {
    await writeFile(join(sourceGraph, "nodes", "html-doc-shell.yml"), KP_YAML, "utf8");
    const result = await seedGraph(layout, sourceGraph);
    expect(result.nodesCopied).toEqual(["html-doc-shell.yml"]);
    await expect(readFile(join(layout.graphNodesDir, "html-doc-shell.yml"), "utf8")).resolves.toBe(
      KP_YAML,
    );
  });

  it("accepts .yaml in addition to .yml", async () => {
    await writeFile(join(sourceGraph, "nodes", "alt.yaml"), KP_YAML, "utf8");
    const result = await seedGraph(layout, sourceGraph);
    expect(result.nodesCopied).toEqual(["alt.yaml"]);
  });

  it("ignores non-yaml files in the source dir", async () => {
    await writeFile(join(sourceGraph, "nodes", "README.md"), "# notes", "utf8");
    await writeFile(join(sourceGraph, "nodes", "index.json"), "{}", "utf8");
    const result = await seedGraph(layout, sourceGraph);
    expect(result.nodesCopied).toEqual([]);
  });

  it("updates an existing shipped graph file when the bundled copy changes", async () => {
    await writeFile(join(sourceGraph, "nodes", "html-doc-shell.yml"), KP_YAML, "utf8");
    const destFile = join(layout.graphNodesDir, "html-doc-shell.yml");
    await writeFile(destFile, "# stale bundled copy\n", "utf8");
    const result = await seedGraph(layout, sourceGraph);
    expect(result.nodesCopied).toEqual(["html-doc-shell.yml"]);
    await expect(readFile(destFile, "utf8")).resolves.toBe(KP_YAML);
  });

  it("removes stale shipped yaml files that no longer exist in the bundled graph", async () => {
    await writeFile(
      join(sourceGraph, "dreams", "show-me-around.yml"),
      "id: show-me-around\n",
      "utf8",
    );
    const staleFile = join(layout.graphDreamsDir, "preview-playground.yml");
    await writeFile(staleFile, "id: preview-playground\n", "utf8");

    const result = await seedGraph(layout, sourceGraph);

    expect(result.dreamsCopied).toEqual(["show-me-around.yml"]);
    await expect(stat(staleFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("seeds dreams dir in parallel with nodes dir", async () => {
    await writeFile(join(sourceGraph, "nodes", "a.yml"), KP_YAML, "utf8");
    await writeFile(join(sourceGraph, "dreams", "snake.yml"), "id: snake\n", "utf8");
    const result = await seedGraph(layout, sourceGraph);
    expect(result.nodesCopied).toEqual(["a.yml"]);
    expect(result.dreamsCopied).toEqual(["snake.yml"]);
  });

  it("tolerates missing source nodes and dreams directories", async () => {
    const result = await seedGraph(layout, join(sourceRoot, "does-not-exist"));
    expect(result).toEqual({ nodesCopied: [], dreamsCopied: [] });
  });

  it("does not remove seeded files when the bundled source dir is missing", async () => {
    const existingFile = join(layout.graphDreamsDir, "existing.yml");
    await writeFile(existingFile, "id: existing\n", "utf8");

    await seedGraph(layout, join(sourceRoot, "does-not-exist"));

    await expect(readFile(existingFile, "utf8")).resolves.toBe("id: existing\n");
  });

  it("seeded nodes dir round-trips through loadKnowledgeGraph", async () => {
    await writeFile(join(sourceGraph, "nodes", "html-doc-shell.yml"), KP_YAML, "utf8");
    await seedGraph(layout, sourceGraph);
    const validation = await loadKnowledgeGraph(layout.graphNodesDir);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.graph.nodes.map((n) => n.id)).toEqual(["html-doc-shell"]);
      expect(validation.graph.byId["html-doc-shell"].area).toBe("html");
    }
  });
});
