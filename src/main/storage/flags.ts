import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParentFlag } from "@shared/flag";
import type { SessionRole } from "@shared/sessionLog";
import type { TranscriptEventKind } from "@shared/transcript";
import { dump as dumpYaml, JSON_SCHEMA, load as parseYaml } from "js-yaml";
import type { ProfilePaths } from "./layout";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const VALID_ROLES: readonly SessionRole[] = ["kid", "parent"];
const VALID_KINDS: readonly TranscriptEventKind[] = [
  "user_message",
  "assistant_message",
  "tool_call",
  "tool_result",
  "error",
];

function timestampSlug(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function hashOf(flag: ParentFlag): string {
  const input = `${flag.sessionId}|${flag.messageTimestamp}|${flag.messageText}`;
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}

export function flagFileNameFor(flag: ParentFlag): string {
  return `${timestampSlug(flag.flaggedAt)}-${hashOf(flag)}.md`;
}

function serializeFlag(flag: ParentFlag): string {
  const yaml = dumpYaml(flag, { lineWidth: 120, schema: JSON_SCHEMA }).trimEnd();
  return `---\n${yaml}\n---\n`;
}

export async function writeFlag(paths: ProfilePaths, flag: ParentFlag): Promise<string> {
  if (flag.messageText.length === 0) throw new Error("messageText must not be empty");
  if (flag.reason.length === 0) throw new Error("reason must not be empty");
  const name = flagFileNameFor(flag);
  await writeFile(join(paths.flagsDir, name), serializeFlag(flag), "utf8");
  return name;
}

export async function deleteFlag(paths: ProfilePaths, flag: ParentFlag): Promise<void> {
  const name = flagFileNameFor(flag);
  await rm(join(paths.flagsDir, name), { force: true });
}

export async function listFlags(paths: ProfilePaths): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(paths.flagsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries.filter((e) => e.endsWith(".md")).sort();
}

export async function loadFlags(paths: ProfilePaths): Promise<ParentFlag[]> {
  const names = await listFlags(paths);
  const flags: ParentFlag[] = [];
  for (const name of names) {
    flags.push(await readFlag(paths, name));
  }
  return flags;
}

export async function readFlag(paths: ProfilePaths, name: string): Promise<ParentFlag> {
  const raw = await readFile(join(paths.flagsDir, name), "utf8");
  const match = raw.match(FRONTMATTER_RE);
  if (!match) throw new Error(`Flag ${name} is missing frontmatter`);
  const parsed = parseYaml(match[1] ?? "", { schema: JSON_SCHEMA });
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Flag ${name} has invalid frontmatter`);
  }
  const fm = parsed as Record<string, unknown>;
  const role = fm.messageRole;
  const kind = fm.messageKind;
  if (
    typeof fm.flaggedAt !== "string" ||
    typeof fm.sessionId !== "string" ||
    typeof fm.messageTimestamp !== "string" ||
    typeof role !== "string" ||
    typeof kind !== "string" ||
    typeof fm.messageText !== "string" ||
    typeof fm.reason !== "string"
  ) {
    throw new Error(`Flag ${name} has invalid frontmatter`);
  }
  if (!VALID_ROLES.includes(role as SessionRole)) {
    throw new Error(`Flag ${name} has invalid messageRole: ${role}`);
  }
  if (!VALID_KINDS.includes(kind as TranscriptEventKind)) {
    throw new Error(`Flag ${name} has invalid messageKind: ${kind}`);
  }
  return {
    flaggedAt: fm.flaggedAt,
    sessionId: fm.sessionId,
    messageTimestamp: fm.messageTimestamp,
    messageRole: role as SessionRole,
    messageKind: kind as TranscriptEventKind,
    messageText: fm.messageText,
    reason: fm.reason,
  };
}
