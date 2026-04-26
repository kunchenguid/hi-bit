import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const electronBuilderYml = resolve(__dirname, "../../../electron-builder.yml");

describe("shipped auto-update decision", () => {
  it("electron-builder.yml keeps publish disabled so the updater stays inert", async () => {
    const text = await readFile(electronBuilderYml, "utf8");
    expect(text).toMatch(/^publish:\s*null\s*$/m);
  });
});
