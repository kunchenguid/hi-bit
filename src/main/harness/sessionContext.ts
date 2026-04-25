import type { Profile } from "@shared/profile";
import type { SessionRole } from "@shared/sessionLog";
import type { HarnessInvocationMode } from "./command";

export type BuildSessionContextOptions = {
  role: SessionRole;
  profile: Profile;
  profileDir: string;
};

export function buildSessionContextPreamble(opts: BuildSessionContextOptions): string {
  const { role, profile, profileDir } = opts;
  const interests =
    profile.interests.length > 0
      ? profile.interests.map((i) => JSON.stringify(i)).join(", ")
      : "none listed";
  const currentDream = profile.currentDreamId ?? "no dream chosen yet";

  if (role === "kid") {
    return [
      "<hibit-context>",
      "mode: kid",
      `kid: { name: ${JSON.stringify(profile.name)}, age: ${profile.age}, interests: [${interests}] }`,
      `profile_dir: ${profileDir}`,
      `current_dream: ${currentDream}`,
      "",
      "You are Bit, the tutor defined in CLAUDE.md / AGENTS.md in your working directory. You are speaking to the kid, not to a developer. Stay in character at all times. Before replying, read state.md and progress.json in the profile directory above for continuity. Never narrate filesystem state, session infrastructure, or agent internals to the kid. If a file is missing, recover silently and keep the conversation natural.",
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
    "",
    "You are Bit, the tutor defined in CLAUDE.md / AGENTS.md in your working directory. You are speaking to the parent, a technical adult who is your co-teacher. Before replying, read state.md and progress.json in the profile directory above. Speak directly and respectfully. Technical register is fine. No emoji, no kid-speak. Do not relay the kid's private struggles to the kid; do not relay the parent's private directives to the kid verbatim.",
    "</hibit-context>",
    "",
  ].join("\n");
}

export type WithSessionContextOptions = BuildSessionContextOptions & {
  userPrompt: string;
  mode: HarnessInvocationMode;
};

export function withSessionContext(opts: WithSessionContextOptions): string {
  if (opts.mode !== "start") return opts.userPrompt;
  return `${buildSessionContextPreamble(opts)}\n${opts.userPrompt}`;
}
