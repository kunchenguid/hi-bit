import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seedCodexAuthIfMissing } from "./seedAuth";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-seed-"));
}

describe("seedCodexAuthIfMissing", () => {
  it("copies the auth file into a fresh dir that has none", async () => {
    const source = await tempRoot();
    const target = await tempRoot();
    const sourcePath = join(source, "auth", "codex.json");
    const targetPath = join(target, "auth", "codex.json");
    await mkdtempStub(sourcePath, '{"version":1}');

    const result = await seedCodexAuthIfMissing({ sourcePath, targetPath });

    expect(result).toBe("seeded");
    expect(await readFile(targetPath, "utf8")).toBe('{"version":1}');
  });

  it("never overwrites an auth file that already exists in the target", async () => {
    const source = await tempRoot();
    const target = await tempRoot();
    const sourcePath = join(source, "auth", "codex.json");
    const targetPath = join(target, "auth", "codex.json");
    await mkdtempStub(sourcePath, '{"from":"source"}');
    await mkdtempStub(targetPath, '{"from":"target"}');

    const result = await seedCodexAuthIfMissing({ sourcePath, targetPath });

    expect(result).toBe("already-present");
    expect(await readFile(targetPath, "utf8")).toBe('{"from":"target"}');
  });

  it("reports when there is no source auth to copy from", async () => {
    const source = await tempRoot();
    const target = await tempRoot();
    const result = await seedCodexAuthIfMissing({
      sourcePath: join(source, "auth", "codex.json"),
      targetPath: join(target, "auth", "codex.json"),
    });

    expect(result).toBe("no-source");
    await expect(stat(join(target, "auth", "codex.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("is a no-op when source and target are the same path (normal run)", async () => {
    const root = await tempRoot();
    const path = join(root, "auth", "codex.json");
    await mkdtempStub(path, '{"from":"real"}');

    const result = await seedCodexAuthIfMissing({ sourcePath: path, targetPath: path });

    expect(result).toBe("skipped");
    expect(await readFile(path, "utf8")).toBe('{"from":"real"}');
  });
});

// Writes a file, creating parent dirs - small inline helper to keep tests terse.
async function mkdtempStub(path: string, contents: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents, "utf8");
}
