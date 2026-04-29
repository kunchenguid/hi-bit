import { join } from "node:path";
import type { Profile } from "@shared/profile";
import type { SessionRole } from "@shared/sessionLog";
import type { HarnessInvocationMode } from "./command";

export type BuildSessionContextOptions = {
  role: SessionRole;
  profile: Profile;
  profileDir: string;
  projectFiles?: string[];
  memory?: SessionMemoryContext;
};

export type SessionMemoryContext = {
  stateMd: string;
  progressJson: string;
};

export function buildSessionContextPreamble(opts: BuildSessionContextOptions): string {
  const { role, profile, profileDir } = opts;
  const interests =
    profile.interests.length > 0
      ? profile.interests.map((i) => JSON.stringify(i)).join(", ")
      : "none listed";
  const currentDream = profile.currentDreamId ?? "no dream chosen yet";
  const projectLines = buildProjectLines(profile, profileDir, opts.projectFiles);
  const memoryLines = opts.memory ? buildMemoryLines(opts.memory) : [];

  if (role === "kid") {
    return [
      "<hibit-context>",
      "mode: kid",
      `kid: { name: ${JSON.stringify(profile.name)}, age: ${profile.age}, interests: [${interests}] }`,
      `profile_dir: ${profileDir}`,
      `current_dream: ${currentDream}`,
      ...projectLines,
      ...memoryLines,
      "",
      "You are Bit, the tutor defined in CLAUDE.md / AGENTS.md in your working directory. You are speaking to the kid, not to a developer. Stay in character at all times. Use the injected context above for continuity. Never narrate filesystem state, session infrastructure, or agent internals to the kid.",
      "</hibit-context>",
      "",
    ].join("\n");
  }

  return [
    "<hibit-context>",
    "mode: parent",
    `kid: { name: ${JSON.stringify(profile.name)}, age: ${profile.age} }`,
    `profile_dir: ${profileDir}`,
    `current_dream: ${currentDream}`,
    ...memoryLines,
    "",
    "You are Bit, the tutor defined in CLAUDE.md / AGENTS.md in your working directory. You are speaking to the parent, a technical adult who is your co-teacher. Use the injected context above for continuity. Speak directly and respectfully. Technical register is fine. No emoji, no kid-speak. Do not relay the kid's private struggles to the kid; do not relay the parent's private directives to the kid verbatim.",
    "</hibit-context>",
    "",
  ].join("\n");
}

function buildMemoryLines(memory: SessionMemoryContext): string[] {
  return [
    "",
    "<hibit-memory>",
    "These memory files were injected by Hi-Bit from the kid profile directory.",
    "Use them as context.",
    "If you need to update memory, write the real files at the relative paths shown here.",
    "",
    '<file path="state.md" format="markdown">',
    memory.stateMd.trimEnd(),
    "</file>",
    "",
    '<file path="progress.json" format="json">',
    memory.progressJson.trimEnd(),
    "</file>",
    "</hibit-memory>",
  ];
}

function buildProjectLines(
  profile: Profile,
  profileDir: string,
  projectFiles: string[] | undefined,
): string[] {
  if (!profile.currentDreamId) return [];
  const files = projectFiles ?? [];
  const lines = [
    `project_dir: ${join(profileDir, "projects", profile.currentDreamId)}`,
    `project_files: ${JSON.stringify(files)}`,
  ];
  if (files.includes("index.html")) {
    lines.push(
      "starter_note: index.html already exists; do not ask the kid to create it. Help them open and change the existing file.",
    );
  }
  return lines;
}

export type WithSessionContextOptions = BuildSessionContextOptions & {
  userPrompt: string;
  mode: HarnessInvocationMode;
};

export function withSessionContext(opts: WithSessionContextOptions): string {
  if (opts.mode !== "start") return opts.userPrompt;
  return `${buildSessionContextPreamble(opts)}\n${opts.userPrompt}`;
}
