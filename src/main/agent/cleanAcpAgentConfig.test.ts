import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCleanAgentRegistry } from "./cleanAcpAgentConfig";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hibit-clean-acp-agent-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createCleanAgentRegistry", () => {
  it("runs the clean launcher through Electron's Node mode", async () => {
    const stateDir = await createTempDir();
    await mkdir(stateDir, { recursive: true });

    const registry = await createCleanAgentRegistry(stateDir);

    expect(registry.resolve("claude")).toContain("ELECTRON_RUN_AS_NODE");
  });
});
