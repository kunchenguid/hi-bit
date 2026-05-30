import { realpathSync } from "node:fs";
import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type EditOperations,
  type FindOperations,
  type GrepOperations,
  type LsOperations,
  type ReadOperations,
  type ToolDefinition,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";

export type ProfileDirectMutation = {
  projectId: string;
  path: string;
  tool: "write" | "edit";
};

type ProfileToolsOptions = {
  onMutation?: (mutation: ProfileDirectMutation) => Promise<void> | void;
};

/**
 * Filesystem tools for Bit, the coordinating session. Bit may look inside the
 * builder's own creations (read/grep/find/ls) but is confined to ONE kid's
 * profile directory. Pi has no global filesystem sandbox,
 * so the confinement is built here: every tool is created with custom
 * `operations` that route each path through {@link resolveWithinProfile} before
 * any disk access. `read` and `ls` are fully mediated this way. `grep` and
 * `find` are mediated at their root-path check (an out-of-jail target is
 * refused); `grep`'s scan still runs through pi's bundled ripgrep, which does
 * not follow symlinks by default, and `find` walks the tree here without
 * following symlinks, so neither escapes the jail.
 */

/**
 * Canonicalize a path by realpath-ing the deepest portion that exists and
 * re-appending the missing tail. This reveals symlink escapes even when the
 * leaf (or a parent) does not exist yet.
 */
function canonicalize(absPath: string): string {
  try {
    return realpathSync(absPath);
  } catch {
    const parent = dirname(absPath);
    if (parent === absPath) return absPath; // filesystem root
    return join(canonicalize(parent), basename(absPath));
  }
}

/**
 * Resolve `requested` (absolute or relative to `profileRoot`) and assert it
 * stays inside the profile. Throws a kid-facing error otherwise. This is the
 * single chokepoint every jailed filesystem operation passes through.
 */
export function resolveWithinProfile(profileRoot: string, requested: string): string {
  const rootAbs = resolve(profileRoot);
  const abs = isAbsolute(requested) ? resolve(requested) : resolve(rootAbs, requested);
  // Canonicalize both sides only for the boundary check, so symlinks (and the
  // /var -> /private/var kind) cannot smuggle a path out of the jail. The
  // returned path stays anchored to the caller's root for predictability.
  const realRoot = canonicalize(rootAbs);
  const canonical = canonicalize(abs);
  if (canonical !== realRoot && !canonical.startsWith(realRoot + sep)) {
    throw new Error("That file is outside this builder's space.");
  }
  return abs;
}

function resolveWithinMainWorkbench(profileRoot: string, requested: string): string {
  const abs = resolveWithinProfile(profileRoot, requested);
  const realRoot = canonicalize(resolve(profileRoot));
  const canonical = canonicalize(abs);
  const parts = relative(realRoot, canonical).split(sep);
  if (
    parts[0] !== "projects" ||
    !parts[1] ||
    parts[2] !== "main-workbench" ||
    parts.slice(3).includes(".git")
  ) {
    throw new Error("That file is outside this builder's space.");
  }
  return abs;
}

function mainWorkbenchMutation(
  profileRoot: string,
  requested: string,
  tool: ProfileDirectMutation["tool"],
): ProfileDirectMutation {
  const abs = resolveWithinMainWorkbench(profileRoot, requested);
  const realRoot = canonicalize(resolve(profileRoot));
  const parts = relative(realRoot, canonicalize(abs)).split(sep);
  return { projectId: parts[1], path: parts.join("/"), tool };
}

function readOperations(profileRoot: string): ReadOperations {
  return {
    readFile: (path) => readFile(resolveWithinProfile(profileRoot, path)),
    access: (path) => access(resolveWithinProfile(profileRoot, path)).then(() => {}),
    // Detect by extension only, after guarding the path: never an unguarded
    // disk touch, while still letting the tool inline real images it reads
    // through the guarded readFile above.
    detectImageMimeType: async (path) => {
      resolveWithinProfile(profileRoot, path);
      return imageMimeFromExtension(path);
    },
  };
}

function lsOperations(profileRoot: string): LsOperations {
  return {
    exists: async (path) => {
      const abs = resolveWithinProfile(profileRoot, path);
      try {
        await access(abs);
        return true;
      } catch {
        return false;
      }
    },
    stat: (path) => stat(resolveWithinProfile(profileRoot, path)),
    readdir: (path) => readdir(resolveWithinProfile(profileRoot, path)),
  };
}

function grepOperations(profileRoot: string): GrepOperations {
  return {
    isDirectory: async (path) =>
      (await stat(resolveWithinProfile(profileRoot, path))).isDirectory(),
    readFile: (path) => readFile(resolveWithinProfile(profileRoot, path), "utf8"),
  };
}

function writeOperations(profileRoot: string, options: ProfileToolsOptions = {}): WriteOperations {
  return {
    writeFile: async (path, content) => {
      const mutation = mainWorkbenchMutation(profileRoot, path, "write");
      await writeFile(resolveWithinMainWorkbench(profileRoot, path), content);
      await options.onMutation?.(mutation);
    },
    mkdir: (dir) =>
      mkdir(resolveWithinMainWorkbench(profileRoot, dir), { recursive: true }).then(() => {}),
  };
}

function editOperations(profileRoot: string, options: ProfileToolsOptions = {}): EditOperations {
  return {
    readFile: (path) => readFile(resolveWithinMainWorkbench(profileRoot, path)),
    writeFile: async (path, content) => {
      const mutation = mainWorkbenchMutation(profileRoot, path, "edit");
      await writeFile(resolveWithinMainWorkbench(profileRoot, path), content);
      await options.onMutation?.(mutation);
    },
    access: (path) => access(resolveWithinMainWorkbench(profileRoot, path)).then(() => {}),
  };
}

function findOperations(profileRoot: string): FindOperations {
  return {
    exists: async (path) => {
      const abs = resolveWithinProfile(profileRoot, path);
      try {
        await access(abs);
        return true;
      } catch {
        return false;
      }
    },
    glob: (pattern, cwd, options) =>
      jailedGlob(resolveWithinProfile(profileRoot, cwd), pattern, options),
  };
}

/**
 * Read/grep/find/ls confined to one profile. Pass these as `customTools` on the
 * coordinating session, leaving `noTools: "builtin"` so the unguarded built-in
 * filesystem tools stay off and these are the only way Bit reaches disk.
 */
export function createProfileReadTools(profileRoot: string): ToolDefinition[] {
  // The per-tool factories return definitions parameterized by their own
  // schema; widening to the base ToolDefinition trips TS function-arg variance
  // on `renderCall` (harmless at runtime), so each is cast to the base type.
  return [
    createReadToolDefinition(profileRoot, { operations: readOperations(profileRoot) }),
    createLsToolDefinition(profileRoot, { operations: lsOperations(profileRoot) }),
    createGrepToolDefinition(profileRoot, { operations: grepOperations(profileRoot) }),
    createFindToolDefinition(profileRoot, { operations: findOperations(profileRoot) }),
  ] as ToolDefinition[];
}

/**
 * The full toolset for Bit, the coordinating session: the read explorers plus
 * `write` and `edit`, confined to creation main-workbench directories. This
 * lets Bit make tiny, trivial fixes itself (a word, a color, one line) instead
 * of waking a worker for everything, while the prompt steers anything bigger to
 * `delegate_build`.
 *
 * Bash is intentionally NOT included: it cannot be routed through the path
 * guard, so granting it would let Bit escape the profile jail. The worker keeps
 * bash because it runs isolated in a git worktree.
 */
export function createProfileTools(
  profileRoot: string,
  options: ProfileToolsOptions = {},
): ToolDefinition[] {
  return [
    ...createProfileReadTools(profileRoot),
    createWriteToolDefinition(profileRoot, { operations: writeOperations(profileRoot, options) }),
    createEditToolDefinition(profileRoot, { operations: editOperations(profileRoot, options) }),
  ] as ToolDefinition[];
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

function imageMimeFromExtension(path: string): string | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return IMAGE_MIME_BY_EXT[path.slice(dot).toLowerCase()] ?? null;
}

/**
 * Walk `root` matching `pattern`, never following symlinks, so results stay
 * inside the jail by construction. Returns absolute paths, honoring `ignore`
 * globs and `limit`.
 */
async function jailedGlob(
  root: string,
  pattern: string,
  options: { ignore: string[]; limit: number },
): Promise<string[]> {
  const matcher = globToRegExp(pattern);
  const ignores = options.ignore.map(globToRegExp);
  const matches: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (matches.length >= options.limit) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= options.limit) return;
      // Skip symlinks entirely: following one could leave the jail.
      if (entry.isSymbolicLink()) continue;
      const abs = join(dir, entry.name);
      const rel = abs.slice(root.length + 1);
      if (ignores.some((re) => re.test(rel))) continue;
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (matcher.test(rel) || matcher.test(entry.name)) {
        matches.push(abs);
      }
    }
  }

  await walk(root);
  return matches;
}

/** Minimal glob compiler supporting `**`, `*`, and `?`. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}
