import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
  it("uses a directly spawnable command for Electron's Node mode", async () => {
    const stateDir = await createTempDir();
    await mkdir(stateDir, { recursive: true });

    const registry = await createCleanAgentRegistry(stateDir);
    const command = registry.resolve("claude");
    const wrapperPath = join(
      stateDir,
      "clean-agent-launch",
      process.platform === "win32" ? "clean-acp-agent-launcher.cmd" : "clean-acp-agent-launcher",
    );

    expect(command).toContain(wrapperPath);
    expect(command).not.toMatch(/^(ELECTRON_RUN_AS_NODE=1|set ELECTRON_RUN_AS_NODE=1)/);
    await access(wrapperPath);
    await expect(readFile(wrapperPath, "utf8")).resolves.toContain("ELECTRON_RUN_AS_NODE");
  });
});
