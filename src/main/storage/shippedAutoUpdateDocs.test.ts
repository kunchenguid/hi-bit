import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const technicalDesign = resolve(__dirname, "../../../TECHNICAL_DESIGN.md");
const v1Gaps = resolve(__dirname, "../../../V1_GAPS.md");
const electronBuilderYml = resolve(__dirname, "../../../electron-builder.yml");

// V1_GAPS.md flagged "No auto-update story" as a packaging note worth deciding
// explicitly. iter-24 closed that gap by deciding v1 ships without an in-app
// updater and documenting the decision in TECHNICAL_DESIGN.md §Resolved. This
// test pins the closure so the gap cannot silently reopen and so the on-disk
// electron-builder config stays consistent with the documented decision.
describe("shipped auto-update decision docs", () => {
  it("TECHNICAL_DESIGN.md §Resolved documents the v1 no-updater decision", async () => {
    const text = await readFile(technicalDesign, "utf8");
    const resolvedIndex = text.indexOf("Resolved:");
    expect(resolvedIndex).toBeGreaterThan(-1);
    const resolvedBlock = text.slice(resolvedIndex);
    expect(resolvedBlock).toMatch(/Auto-update story/i);
    expect(resolvedBlock).toMatch(/without.*in-app/i);
    expect(resolvedBlock).toMatch(/electron-builder\.yml/);
    expect(resolvedBlock).toMatch(/publish: null/);
    expect(resolvedBlock).toMatch(/Homebrew cask/i);
  });

  it("electron-builder.yml keeps publish disabled so the updater stays inert", async () => {
    const text = await readFile(electronBuilderYml, "utf8");
    expect(text).toMatch(/^publish:\s*null\s*$/m);
  });

  it("V1_GAPS.md no longer lists an undecided auto-update story", async () => {
    const text = await readFile(v1Gaps, "utf8");
    expect(text).not.toMatch(/No auto-update story/);
    expect(text).toMatch(/Auto-update:/);
  });
});
