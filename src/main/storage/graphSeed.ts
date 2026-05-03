import { copyFile, readdir, readFile, stat, unlink } from "node:fs/promises";
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
  if (!(await pathExists(sourceDir))) return copied;
  const files = await listYamlFiles(sourceDir);
  const sourceFileSet = new Set(files);
  const existingFiles = await listYamlFiles(destDir);
  await Promise.all(
    existingFiles
      .filter((file) => !sourceFileSet.has(file))
      .map((file) => unlink(join(destDir, file))),
  );
  for (const file of files) {
    const dest = join(destDir, file);
    const source = join(sourceDir, file);
    if (await pathExists(dest)) {
      const [sourceText, destText] = await Promise.all([
        readFile(source, "utf8"),
        readFile(dest, "utf8"),
      ]);
      if (sourceText === destText) continue;
    }
    await copyFile(source, dest);
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
