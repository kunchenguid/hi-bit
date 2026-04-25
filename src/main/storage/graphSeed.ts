import { copyFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { HiBitLayout } from "./layout";

export type GraphSeedResult = {
  nodesCopied: string[];
  dreamsCopied: string[];
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function seedDir(sourceDir: string, destDir: string): Promise<string[]> {
  const copied: string[] = [];
  const files = await listYamlFiles(sourceDir);
  for (const file of files) {
    const dest = join(destDir, file);
    if (await pathExists(dest)) continue;
    await copyFile(join(sourceDir, file), dest);
    copied.push(file);
  }
  return copied;
}

export async function seedGraph(
  layout: HiBitLayout,
  sourceGraphDir: string,
): Promise<GraphSeedResult> {
  const [nodesCopied, dreamsCopied] = await Promise.all([
    seedDir(join(sourceGraphDir, "nodes"), layout.graphNodesDir),
    seedDir(join(sourceGraphDir, "dreams"), layout.graphDreamsDir),
  ]);
  return { nodesCopied, dreamsCopied };
}
