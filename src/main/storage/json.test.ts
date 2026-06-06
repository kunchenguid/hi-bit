import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonFile } from "./json";

describe("writeJsonFile", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hibit-json-"));
    path = join(dir, "data.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a value", async () => {
    await writeJsonFile(path, { a: 1 });
    expect(await readJsonFile<{ a: number }>(path)).toEqual({ a: 1 });
  });

  it("survives many concurrent writes to the same path without an ENOENT race", async () => {
    // Same pid + same millisecond used to collide on the temp filename, so one
    // rename moved it and the next renamed a file that was already gone.
    await Promise.all(Array.from({ length: 40 }, (_, i) => writeJsonFile(path, { n: i })));
    // Whichever won, the file is present and valid JSON (no half-written/missing).
    const result = await readJsonFile<{ n: number }>(path);
    expect(result).not.toBeNull();
    expect(typeof result?.n).toBe("number");
  });
});
