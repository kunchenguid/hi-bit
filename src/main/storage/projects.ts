import { type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dream } from "@shared/dreams";
import type { ProjectFileChange } from "@shared/project";
import type { ProfilePaths } from "./layout";

export type { ProjectFileChange, ProjectFileChangeKind } from "@shared/project";

const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertSafeSegment(label: string, value: string): void {
  if (!SAFE_NAME_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

export function projectPathFor(paths: ProfilePaths, slug: string): string {
  assertSafeSegment("project slug", slug);
  return join(paths.projectsDir, slug);
}

export async function resolveProjectDir(paths: ProfilePaths, slug: string): Promise<string> {
  const dir = projectPathFor(paths, slug);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function listProjectSlugs(paths: ProfilePaths): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(paths.projectsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const slugs = await Promise.all(
    entries.map(async (entry) => {
      if (!SAFE_NAME_PATTERN.test(entry)) return null;
      const stats = await stat(join(paths.projectsDir, entry)).catch(() => null);
      return stats?.isDirectory() ? entry : null;
    }),
  );
  return slugs.filter((s): s is string => s !== null).sort((a, b) => a.localeCompare(b));
}

export async function listProjectFiles(paths: ProfilePaths, slug: string): Promise<string[]> {
  const dir = projectPathFor(paths, slug);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const stats = await stat(join(dir, entry)).catch(() => null);
      return stats?.isFile() ? entry : null;
    }),
  );
  return files.filter((f): f is string => f !== null).sort((a, b) => a.localeCompare(b));
}

export async function readProjectFile(
  paths: ProfilePaths,
  slug: string,
  filename: string,
): Promise<string> {
  assertSafeSegment("project file name", filename);
  const dir = projectPathFor(paths, slug);
  return readFile(join(dir, filename), "utf8");
}

export async function writeProjectFile(
  paths: ProfilePaths,
  slug: string,
  filename: string,
  content: string,
): Promise<void> {
  assertSafeSegment("project file name", filename);
  const dir = projectPathFor(paths, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), content, "utf8");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sentenceCase(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function starterIndexHtml(dream: Dream, profileName: string): string {
  const rawTitle = dream.title_kid;
  const title = escapeHtml(rawTitle);
  const sentenceTitle = escapeHtml(sentenceCase(rawTitle));
  const name = escapeHtml(profileName);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1>${name}'s page</h1>
    <p>${sentenceTitle}. Change anything to make it yours.</p>
  </body>
</html>
`;
}

export type ProjectFileWatcher = { close: () => void };

export async function watchProjectFiles(
  paths: ProfilePaths,
  slug: string,
  onChange: (event: ProjectFileChange) => void,
): Promise<ProjectFileWatcher> {
  const dir = projectPathFor(paths, slug);
  await mkdir(dir, { recursive: true });
  let watcher: FSWatcher;
  try {
    watcher = watch(dir, { persistent: false, encoding: "utf8" });
  } catch (err) {
    throw new Error(
      `Could not watch project ${slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  watcher.on("change", (eventType, filename) => {
    if (typeof filename !== "string" || filename.length === 0) return;
    if (!SAFE_NAME_PATTERN.test(filename)) return;
    onChange({
      kind: eventType === "rename" ? "renamed" : "changed",
      filename,
    });
  });
  watcher.on("error", () => {
    /* swallow: watcher goes dead when the dir is removed; callers close explicitly */
  });
  return {
    close: () => {
      watcher.close();
    },
  };
}

export type ScaffoldResult = { created: string[]; skipped: string[] };

export type ScaffoldOptions = { profileName: string };

export async function scaffoldProject(
  paths: ProfilePaths,
  dream: Dream,
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const dir = projectPathFor(paths, dream.id);
  await mkdir(dir, { recursive: true });
  const files: Array<{ name: string; content: string }> = [
    { name: "index.html", content: starterIndexHtml(dream, options.profileName) },
  ];
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { name, content } of files) {
    const target = join(dir, name);
    const exists = await stat(target)
      .then(() => true)
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return false;
        throw err;
      });
    if (exists) {
      skipped.push(name);
    } else {
      await writeFile(target, content, "utf8");
      created.push(name);
    }
  }
  return { created, skipped };
}
