import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, type HiBitLayout } from "./layout";
import { promptsBitPath, seedBitPrompt } from "./prompts";

describe("seedBitPrompt", () => {
  let root: string;
  let layout: HiBitLayout;
  let sourceDir: string;
  let sourceFile: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-prompts-"));
    layout = await bootstrapLayout(root);
    sourceDir = await mkdtemp(join(tmpdir(), "hi-bit-prompts-src-"));
    sourceFile = join(sourceDir, "bit.md");
    await writeFile(sourceFile, "# Bit source\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it("copies the source bit.md into promptsDir on first seed", async () => {
    const dest = await seedBitPrompt(layout, sourceFile);
    expect(dest).toBe(promptsBitPath(layout));
    await expect(readFile(dest, "utf8")).resolves.toBe("# Bit source\n");
  });

  it("refreshes an existing bit.md so prompt updates propagate to installed users", async () => {
    const dest = promptsBitPath(layout);
    await writeFile(dest, "# Stale cached copy\n", "utf8");
    await seedBitPrompt(layout, sourceFile);
    await expect(readFile(dest, "utf8")).resolves.toBe("# Bit source\n");
  });
});
