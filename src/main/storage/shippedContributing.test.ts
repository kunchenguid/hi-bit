import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contributing = resolve(__dirname, "../../../CONTRIBUTING.md");
const prd = resolve(__dirname, "../../../PRD.md");

// The shipped CONTRIBUTING.md answers the PRD "Open questions" entry:
// "Who owns the canonical knowledge graph, and how do community PRs for new
// KPs/dreams get reviewed?" - so the doc must keep covering the ownership
// statement plus the KP and dream review paths, or the PRD gap reopens.
const REQUIRED_SECTIONS: Array<{ topic: string; markers: RegExp[] }> = [
  {
    topic: "ownership of the canonical graph",
    markers: [/## Ownership/i, /graph\/nodes/i, /graph\/dreams/i, /Kun Chen/i],
  },
  {
    topic: "KP authoring guidance",
    markers: [/## Adding a knowledge point/i, /docs\/knowledge-graph\.md/i, /Stable id/i],
  },
  {
    topic: "dream authoring guidance",
    markers: [
      /## Adding a dream/i,
      /src\/shared\/dreams\.ts/i,
      /src\/main\/graph\/shipped\.test\.ts/i,
    ],
  },
  {
    topic: "review process",
    markers: [/## Review process/i, /npm test/i, /biome/i],
  },
  {
    topic: "MIT licensing of contributions",
    markers: [/## Licensing/i, /MIT/i],
  },
];

describe("shipped CONTRIBUTING.md", () => {
  it("exists at the repo root", async () => {
    const text = await readFile(contributing, "utf8");
    expect(text.length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_SECTIONS)("covers topic: $topic", async ({ markers }) => {
    const text = await readFile(contributing, "utf8");
    for (const marker of markers) {
      expect(text).toMatch(marker);
    }
  });

  it("does not use em dashes (house style)", async () => {
    const text = await readFile(contributing, "utf8");
    expect(text).not.toMatch(/—/);
  });

  // The PRD "canonical knowledge graph ownership" open question is resolved by
  // CONTRIBUTING.md (see comment at top). PRD.md §Resolved must cite
  // CONTRIBUTING.md for graph ownership, and PRD.md §"Open questions" must no
  // longer list the question, or the resolution has silently regressed.
  it("PRD.md cites CONTRIBUTING.md as the graph-ownership resolution", async () => {
    const text = await readFile(prd, "utf8");
    const resolvedIndex = text.indexOf("## Resolved");
    const openIndex = text.indexOf("## Open questions");
    expect(resolvedIndex).toBeGreaterThan(-1);
    expect(openIndex).toBeGreaterThan(-1);
    expect(openIndex).toBeLessThan(resolvedIndex);
    const openBlock = text.slice(openIndex, resolvedIndex);
    const resolvedBlock = text.slice(resolvedIndex);
    expect(openBlock).not.toMatch(/canonical knowledge graph/i);
    expect(resolvedBlock).toMatch(/Canonical knowledge graph ownership/i);
    expect(resolvedBlock).toMatch(/CONTRIBUTING\.md/);
  });
});
