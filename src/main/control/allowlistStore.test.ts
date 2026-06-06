import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOWLIST } from "./allowlist";
import { AllowlistStore } from "./allowlistStore";

describe("AllowlistStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hibit-allowlist-"));
    path = join(dir, "browser-allowlist.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("seeds the kid-safe defaults on first load and writes them to disk", async () => {
    const store = new AllowlistStore(path);
    const loaded = await store.load();
    expect(loaded).toEqual([...DEFAULT_ALLOWLIST].sort());
    const onDisk = JSON.parse(await readFile(path, "utf8"));
    expect(onDisk.domains).toEqual([...DEFAULT_ALLOWLIST].sort());
  });

  it("round-trips a saved, normalized, de-duplicated list", async () => {
    const store = new AllowlistStore(path);
    await store.save(["HTTPS://www.Example.com/x", "example.com", "code.org"]);
    expect(await store.load()).toEqual(["code.org", "example.com"]);
  });
});
