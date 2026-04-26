import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contributing = resolve(__dirname, "../../../CONTRIBUTING.md");

// CONTRIBUTING.md must keep covering the ownership statement plus the KP and
// dream review paths so the canonical-graph contribution flow stays clear.
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
});
