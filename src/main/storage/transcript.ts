import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionRole } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import type { ProfilePaths } from "./layout";

export const DREAM_SWITCH_METADATA_TYPE = "dream_switch";

export function buildDreamSwitchText(dreamTitleKid: string): string {
  const trimmed = dreamTitleKid.trim();
  if (trimmed.length === 0) return "New project";
  return `New project: ${trimmed}`;
}

export function buildDreamSwitchEvent(args: {
  timestamp: string;
  sessionId: string;
  role: SessionRole;
  dreamId: string;
  dreamTitleKid: string;
}): TranscriptEvent {
  return {
    timestamp: args.timestamp,
    role: args.role,
    sessionId: args.sessionId,
    kind: "system_event",
    text: buildDreamSwitchText(args.dreamTitleKid),
    metadata: { type: DREAM_SWITCH_METADATA_TYPE, dreamId: args.dreamId },
  };
}

export function transcriptFileFor(paths: ProfilePaths, sessionId: string): string {
  if (sessionId.length === 0) {
    throw new Error("sessionId must not be empty");
  }
  return join(paths.transcriptsDir, `${sessionId}.jsonl`);
}

export async function appendTranscriptEvent(
  paths: ProfilePaths,
  event: TranscriptEvent,
): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;
  await appendFile(transcriptFileFor(paths, event.sessionId), line, "utf8");
}

export async function readTranscript(
  paths: ProfilePaths,
  sessionId: string,
): Promise<TranscriptEvent[]> {
  let raw: string;
  try {
    raw = await readFile(transcriptFileFor(paths, sessionId), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const events: TranscriptEvent[] = [];
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    events.push(JSON.parse(line) as TranscriptEvent);
  }
  return events;
}
