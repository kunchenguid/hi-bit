import { appendFile, readFile } from "node:fs/promises";
import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { ProfilePaths } from "./layout";

export async function appendSessionLogEntry(
  paths: ProfilePaths,
  entry: HarnessInvocationLogEntry,
): Promise<void> {
  const line = `${JSON.stringify(entry)}\n`;
  await appendFile(paths.sessionLogFile, line, "utf8");
}

export async function readSessionLogEntries(
  paths: ProfilePaths,
): Promise<HarnessInvocationLogEntry[]> {
  let raw: string;
  try {
    raw = await readFile(paths.sessionLogFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const entries: HarnessInvocationLogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    entries.push(JSON.parse(line) as HarnessInvocationLogEntry);
  }
  return entries;
}
