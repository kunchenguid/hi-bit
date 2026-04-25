import { stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { HARNESS_IDS, type HarnessDetection, type HarnessId } from "@shared/config";

export type DetectOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

export async function detectHarnesses(options: DetectOptions = {}): Promise<HarnessDetection> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const entries = await Promise.all(
    HARNESS_IDS.map(async (id): Promise<[HarnessId, string | null]> => {
      const path = await lookupOnPath(id, env, platform);
      return [id, path];
    }),
  );
  return Object.fromEntries(entries) as HarnessDetection;
}

export async function lookupOnPath(
  binary: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const pathVar = env.PATH ?? env.Path ?? "";
  const dirs = pathVar.split(delimiter).filter((p) => p.length > 0);
  const extensions = extensionsFor(env, platform);
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, binary + ext);
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function extensionsFor(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return [""];
  const pathext = env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  return pathext
    .split(";")
    .map((e) => e.toLowerCase())
    .filter((e) => e.length > 0);
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    return false;
  }
}
