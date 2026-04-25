import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectHarnesses, lookupOnPath } from "./detect";

async function touchExecutable(path: string): Promise<void> {
  await writeFile(path, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(path, 0o755);
}

describe("harness detection", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-detect-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lookupOnPath resolves a binary placed in a PATH dir", async () => {
    const binDir = join(root, "bin");
    await mkdir(binDir, { recursive: true });
    const bin = join(binDir, "claude");
    await touchExecutable(bin);
    const env = { PATH: binDir };
    await expect(lookupOnPath("claude", env, "linux")).resolves.toBe(bin);
  });

  it("lookupOnPath returns null when the binary is absent", async () => {
    await expect(lookupOnPath("claude", { PATH: root }, "linux")).resolves.toBeNull();
  });

  it("lookupOnPath skips empty PATH entries and ignores missing dirs", async () => {
    const binDir = join(root, "realbin");
    await mkdir(binDir, { recursive: true });
    const bin = join(binDir, "codex");
    await touchExecutable(bin);
    const env = { PATH: ["", join(root, "missing"), binDir].join(delimiter) };
    await expect(lookupOnPath("codex", env, "linux")).resolves.toBe(bin);
  });

  it("lookupOnPath applies PATHEXT on win32", async () => {
    const binDir = join(root, "winbin");
    await mkdir(binDir, { recursive: true });
    const bin = join(binDir, "opencode.cmd");
    await touchExecutable(bin);
    const env = { PATH: binDir, PATHEXT: ".EXE;.CMD;.BAT" };
    await expect(lookupOnPath("opencode", env, "win32")).resolves.toBe(bin);
  });

  it("detectHarnesses returns a record for all harnesses", async () => {
    const binDir = join(root, "bin");
    await mkdir(binDir, { recursive: true });
    await touchExecutable(join(binDir, "claude"));
    await touchExecutable(join(binDir, "opencode"));
    const result = await detectHarnesses({ env: { PATH: binDir }, platform: "linux" });
    expect(result).toEqual({
      claude: join(binDir, "claude"),
      codex: null,
      opencode: join(binDir, "opencode"),
    });
  });
});
