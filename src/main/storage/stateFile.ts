import { readFile, writeFile } from "node:fs/promises";
import type { Dream } from "@shared/dreams";
import type { ParentFlag } from "@shared/flag";
import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import type { ProfilePaths } from "./layout";

const FLAGS_HEADER = "## Flagged messages";
const FLAGS_SECTION_RE = /## Flagged messages\n\n[\s\S]*?(?=\n## |$)/;
const CURRENT_DREAM_HEADER = "## Current dream";
const CURRENT_DREAM_SECTION_RE = /## Current dream\n\n[\s\S]*?(?=\n## |$)/;
const CURRENT_SESSION_HEADER = "## Current session";
const CURRENT_SESSION_SECTION_RE = /## Current session\n\n[\s\S]*?(?=\n## |$)/;
const DIRECTIVES_HEADER = "## Recent parent directives";
const DIRECTIVES_SECTION_RE = /## Recent parent directives\n\n[\s\S]*?(?=\n## |$)/;
const SESSION_SUMMARIES_HEADER = "## Recent session summaries";
const SESSION_SUMMARIES_SECTION_RE = /## Recent session summaries\n\n[\s\S]*?(?=\n## |$)/;
const VOICE_PREFERENCES_HEADER = "## Voice preferences";
const VOICE_PREFERENCES_SECTION_RE = /## Voice preferences\n\n[\s\S]*?(?=\n## |$)/;
const PARENT_NOTES_HEADER = "## Parent notes";
const PARENT_NOTES_SECTION_RE = /## Parent notes\n\n[\s\S]*?(?=\n## |$)/;
const PROFILE_HEADER = "## Profile";
const PROFILE_SECTION_RE = /## Profile\n\n[\s\S]*?(?=\n## |$)/;

export const DEFAULT_IDLE_GAP_MS = 30 * 60 * 1000;

function speakerLabel(flag: ParentFlag): string {
  if (flag.messageKind === "assistant_message") return "Bit said";
  if (flag.messageKind === "user_message") {
    return flag.messageRole === "parent" ? "Parent said" : "Kid said";
  }
  return flag.messageKind.replace(/_/g, " ");
}

function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

export function renderFlagsSection(flags: ParentFlag[]): string {
  if (flags.length === 0) return "None yet.";
  return flags
    .map((flag) => {
      return [
        `- Flagged on ${flag.flaggedAt} (${flag.messageRole} session)`,
        `  - ${speakerLabel(flag)}: ${oneLine(flag.messageText)}`,
        `  - Reason: ${oneLine(flag.reason)}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function applyFlagsToStateMd(stateMd: string, flags: ParentFlag[]): string {
  const body = renderFlagsSection(flags);
  if (!stateMd.includes(FLAGS_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${FLAGS_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(FLAGS_SECTION_RE, (match, offset: number) => {
    const replacement = `${FLAGS_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdFlags(paths: ProfilePaths, flags: ParentFlag[]): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyFlagsToStateMd(current, flags);
  await writeFile(paths.stateFile, updated, "utf8");
}

export function renderCurrentDreamSection(dream: Dream | null): string {
  if (!dream) return "None selected yet.";
  const categories = dream.categories.length > 0 ? dream.categories.join(", ") : "uncategorized";
  return [
    `- Title: ${dream.title_parent} (dream id: ${dream.id})`,
    `- For you: ${oneLine(dream.title_kid)}`,
    `- Summary: ${oneLine(dream.summary_kid)}`,
    `- Categories: ${categories}`,
  ].join("\n");
}

export function applyCurrentDreamToStateMd(stateMd: string, dream: Dream | null): string {
  const body = renderCurrentDreamSection(dream);
  if (!stateMd.includes(CURRENT_DREAM_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${CURRENT_DREAM_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(CURRENT_DREAM_SECTION_RE, (match, offset: number) => {
    const replacement = `${CURRENT_DREAM_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdCurrentDream(
  paths: ProfilePaths,
  dream: Dream | null,
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyCurrentDreamToStateMd(current, dream);
  await writeFile(paths.stateFile, updated, "utf8");
}

export function renderRecentParentDirectivesSection(directives: TranscriptEvent[]): string {
  if (directives.length === 0) return "None yet.";
  return directives.map((d) => `- ${d.timestamp}: ${oneLine(d.text)}`).join("\n");
}

export function applyRecentParentDirectivesToStateMd(
  stateMd: string,
  directives: TranscriptEvent[],
): string {
  const body = renderRecentParentDirectivesSection(directives);
  if (!stateMd.includes(DIRECTIVES_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${DIRECTIVES_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(DIRECTIVES_SECTION_RE, (match, offset: number) => {
    const replacement = `${DIRECTIVES_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdRecentParentDirectives(
  paths: ProfilePaths,
  directives: TranscriptEvent[],
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyRecentParentDirectivesToStateMd(current, directives);
  await writeFile(paths.stateFile, updated, "utf8");
}

export type SessionSummary = {
  sessionId: string;
  role: "kid" | "parent";
  firstAt: string;
  lastAt: string;
  turnCount: number;
  totalDurationMs: number;
};

export function summarizeSessionLog(entries: HarnessInvocationLogEntry[]): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();
  for (const entry of entries) {
    const existing = bySession.get(entry.sessionId);
    if (existing) {
      existing.turnCount += 1;
      existing.totalDurationMs += entry.durationMs;
      if (entry.timestamp < existing.firstAt) existing.firstAt = entry.timestamp;
      if (entry.timestamp > existing.lastAt) existing.lastAt = entry.timestamp;
    } else {
      bySession.set(entry.sessionId, {
        sessionId: entry.sessionId,
        role: entry.role,
        firstAt: entry.timestamp,
        lastAt: entry.timestamp,
        turnCount: 1,
        totalDurationMs: entry.durationMs,
      });
    }
  }
  return Array.from(bySession.values()).sort((a, b) => a.lastAt.localeCompare(b.lastAt));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return remSeconds === 0 ? `${minutes}m` : `${minutes}m ${remSeconds}s`;
}

export function renderRecentSessionSummariesSection(summaries: SessionSummary[]): string {
  if (summaries.length === 0) return "None yet.";
  return summaries
    .map((s) => {
      const turns = s.turnCount === 1 ? "1 turn" : `${s.turnCount} turns`;
      return `- ${s.lastAt} (${s.role} session): ${turns}, ${formatDuration(s.totalDurationMs)} total`;
    })
    .join("\n");
}

export function applyRecentSessionSummariesToStateMd(
  stateMd: string,
  summaries: SessionSummary[],
): string {
  const body = renderRecentSessionSummariesSection(summaries);
  if (!stateMd.includes(SESSION_SUMMARIES_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${SESSION_SUMMARIES_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(SESSION_SUMMARIES_SECTION_RE, (match, offset: number) => {
    const replacement = `${SESSION_SUMMARIES_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdRecentSessionSummaries(
  paths: ProfilePaths,
  summaries: SessionSummary[],
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyRecentSessionSummariesToStateMd(current, summaries);
  await writeFile(paths.stateFile, updated, "utf8");
}

export type VoicePreferencesInput = {
  sessionTargetMinutes?: number;
  voicePreferences?: string;
};

export function renderVoicePreferencesSection(input: VoicePreferencesInput): string {
  const lines: string[] = [];
  if (input.sessionTargetMinutes !== undefined) {
    lines.push(`- Target session length: ${input.sessionTargetMinutes} minutes`);
  }
  const voice = input.voicePreferences?.trim();
  if (voice && voice.length > 0) {
    lines.push(`- Voice notes: ${oneLine(voice)}`);
  }
  if (lines.length === 0) return "Not set yet. Bit will learn from early sessions.";
  return lines.join("\n");
}

export function applyVoicePreferencesToStateMd(
  stateMd: string,
  input: VoicePreferencesInput,
): string {
  const body = renderVoicePreferencesSection(input);
  if (!stateMd.includes(VOICE_PREFERENCES_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${VOICE_PREFERENCES_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(VOICE_PREFERENCES_SECTION_RE, (match, offset: number) => {
    const replacement = `${VOICE_PREFERENCES_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdVoicePreferences(
  paths: ProfilePaths,
  input: VoicePreferencesInput,
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyVoicePreferencesToStateMd(current, input);
  await writeFile(paths.stateFile, updated, "utf8");
}

export type CurrentSession = {
  startedAt: string;
  lastAt: string;
  turnCount: number;
  elapsedMs: number;
};

export type ComputeCurrentSessionOptions = {
  role: "kid" | "parent";
  now: number;
  idleGapMs?: number;
};

export function computeCurrentSession(
  entries: HarnessInvocationLogEntry[],
  opts: ComputeCurrentSessionOptions,
): CurrentSession | null {
  const idleGapMs = opts.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
  const matching = entries
    .filter((e) => e.role === opts.role)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (matching.length === 0) return null;
  const lastEntry = matching[matching.length - 1];
  if (!lastEntry) return null;
  const lastTime = Date.parse(lastEntry.timestamp);
  if (!Number.isFinite(lastTime)) return null;
  if (opts.now - lastTime > idleGapMs) return null;

  let startIdx = matching.length - 1;
  while (startIdx > 0) {
    const curr = matching[startIdx];
    const prev = matching[startIdx - 1];
    if (!curr || !prev) break;
    const currTime = Date.parse(curr.timestamp);
    const prevTime = Date.parse(prev.timestamp);
    if (!Number.isFinite(currTime) || !Number.isFinite(prevTime)) break;
    if (currTime - prevTime > idleGapMs) break;
    startIdx -= 1;
  }
  const firstEntry = matching[startIdx];
  if (!firstEntry) return null;
  const startedAtMs = Date.parse(firstEntry.timestamp);
  return {
    startedAt: firstEntry.timestamp,
    lastAt: lastEntry.timestamp,
    turnCount: matching.length - startIdx,
    elapsedMs: Math.max(0, opts.now - startedAtMs),
  };
}

function sessionStatusLabel(elapsedMinutes: number, targetMinutes: number): string {
  if (elapsedMinutes >= targetMinutes) {
    return "over target - wrap up at the next clean moment";
  }
  if (elapsedMinutes >= Math.floor(targetMinutes * 0.8)) {
    return "near target - start looking for a natural stop";
  }
  return "under target - keep teaching";
}

export function renderCurrentSessionSection(
  session: CurrentSession | null,
  targetMinutes: number,
): string {
  if (!session) return "No active session right now.";
  const elapsedMinutes = Math.floor(session.elapsedMs / 60000);
  const turns = session.turnCount === 1 ? "1 turn" : `${session.turnCount} turns`;
  return [
    `- Started: ${session.startedAt}`,
    `- Target: ${targetMinutes} minutes`,
    `- Elapsed: ${elapsedMinutes} minutes (${turns} so far)`,
    `- Status: ${sessionStatusLabel(elapsedMinutes, targetMinutes)}`,
  ].join("\n");
}

export function applyCurrentSessionToStateMd(
  stateMd: string,
  session: CurrentSession | null,
  targetMinutes: number,
): string {
  const body = renderCurrentSessionSection(session, targetMinutes);
  if (!stateMd.includes(CURRENT_SESSION_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${CURRENT_SESSION_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(CURRENT_SESSION_SECTION_RE, (match, offset: number) => {
    const replacement = `${CURRENT_SESSION_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdCurrentSession(
  paths: ProfilePaths,
  session: CurrentSession | null,
  targetMinutes: number,
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyCurrentSessionToStateMd(current, session, targetMinutes);
  await writeFile(paths.stateFile, updated, "utf8");
}

export function renderParentNotesSection(notes: string | null | undefined): string {
  const trimmed = notes?.trim() ?? "";
  if (trimmed.length === 0) return "None.";
  return trimmed;
}

export function applyParentNotesToStateMd(
  stateMd: string,
  notes: string | null | undefined,
): string {
  const body = renderParentNotesSection(notes);
  if (!stateMd.includes(PARENT_NOTES_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    return `${trimmed}\n\n${PARENT_NOTES_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(PARENT_NOTES_SECTION_RE, (match, offset: number) => {
    const replacement = `${PARENT_NOTES_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdParentNotes(
  paths: ProfilePaths,
  notes: string | null | undefined,
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyParentNotesToStateMd(current, notes);
  await writeFile(paths.stateFile, updated, "utf8");
}

export type ProfileSectionInput = {
  name: string;
  age: number;
  interests: readonly string[];
};

export function renderProfileSection(input: ProfileSectionInput): string {
  const interestsLine = input.interests.length > 0 ? input.interests.join(", ") : "not set yet";
  return `- Name: ${input.name}\n- Age: ${input.age}\n- Interests: ${interestsLine}`;
}

export function applyProfileSectionToStateMd(stateMd: string, input: ProfileSectionInput): string {
  const body = renderProfileSection(input);
  if (!stateMd.includes(PROFILE_HEADER)) {
    const trimmed = stateMd.replace(/\n*$/, "");
    const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
    return `${prefix}${PROFILE_HEADER}\n\n${body}\n`;
  }
  return stateMd.replace(PROFILE_SECTION_RE, (match, offset: number) => {
    const replacement = `${PROFILE_HEADER}\n\n${body}`;
    const endOfMatch = offset + match.length;
    return endOfMatch === stateMd.length ? `${replacement}\n` : replacement;
  });
}

export async function updateStateMdProfile(
  paths: ProfilePaths,
  input: ProfileSectionInput,
): Promise<void> {
  let current: string;
  try {
    current = await readFile(paths.stateFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      current = "";
    } else {
      throw err;
    }
  }
  const updated = applyProfileSectionToStateMd(current, input);
  await writeFile(paths.stateFile, updated, "utf8");
}
