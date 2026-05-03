import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function mergePathValues(
  current: string | undefined,
  discovered: string | undefined,
): string {
  const entries: string[] = [];
  const seen = new Set<string>();
  for (const value of [current, discovered]) {
    for (const entry of (value ?? "").split(delimiter)) {
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      entries.push(trimmed);
    }
  }
  return entries.join(delimiter);
}

export async function hydrateShellPath(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (process.platform === "win32") return;
  const shell = env.SHELL?.trim() || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  try {
    const { stdout } = await execFileAsync(shell, ["-lc", 'printf %s "$PATH"'], {
      env,
      timeout: 2000,
      windowsHide: true,
      maxBuffer: 8192,
    });
    const merged = mergePathValues(env.PATH, stdout);
    if (merged) env.PATH = merged;
  } catch (err) {
    void err;
  }
}
