import { join } from "node:path";
import type { Profile } from "@shared/profile";
import type { SessionRole } from "@shared/sessionLog";

export type HarnessInvocationMode = "start" | "resume";

export type BuildSessionContextOptions = {
  role: SessionRole;
  profile: Profile;
  profileDir: string;
  projectFiles?: string[];
  memory?: SessionMemoryContext;
  learningPlan?: LearningPlanContext;
};

export type LearningPlanKp = {
  id: string;
  titleKid: string;
  whyKid?: string;
  status: string | null;
  masterySignals?: {
    saw_it: string;
    did_with_help: string;
    did_unprompted: string;
    explained_it: string;
  };
};

export type LearningPlanContext = {
  dream: { id: string; titleKid: string };
  nextUpKpId: string | null;
  requiredKps: LearningPlanKp[];
};

export type SessionMemoryContext = {
  stateMd: string;
  progressJson: string;
};

const DREAM_COMPLETING_STATUSES = new Set(["did_with_help", "did_unprompted", "explained_it"]);

export function buildSessionContextPreamble(opts: BuildSessionContextOptions): string {
  const { role, profile, profileDir } = opts;
  const interests =
    profile.interests.length > 0
      ? profile.interests.map((i) => JSON.stringify(i)).join(", ")
      : "none listed";
  const currentDream = profile.currentDreamId ?? "no dream chosen yet";
  const projectLines = buildProjectLines(profile, profileDir, opts.projectFiles);
  const memoryLines = opts.memory ? buildMemoryLines(opts.memory) : [];
  const learningPlanLines = opts.learningPlan ? buildLearningPlanLines(opts.learningPlan) : [];

  if (role === "kid") {
    return [
      "<hi-bit:context>",
      "mode: kid",
      `kid: { name: ${JSON.stringify(profile.name)}, age: ${profile.age}, interests: [${interests}] }`,
      `exact_kid_name: ${JSON.stringify(profile.name)}`,
      `Use exact_kid_name exactly when you write the kid's name; do not shorten it to ${JSON.stringify(profile.name.split(/\s+/)[0] ?? profile.name)}.`,
      `If a starter page says "My Name", say the exact replacement ${JSON.stringify(profile.name)} immediately. Do not say "your real name" first. Do not say "your actual name" first.`,
      `For any visible reply about changing "My Name", never write "your actual name", "your real name", or similar placeholder wording anywhere in the reply. Say ${JSON.stringify(profile.name)} every time you describe that replacement.`,
      `profile_dir: ${profileDir}`,
      `current_dream: ${currentDream}`,
      ...projectLines,
      ...memoryLines,
      ...learningPlanLines,
      "",
      "You are Bit, the tutor defined in CLAUDE.md / AGENTS.md in your working directory. You are speaking to the kid, not to a developer. Stay in character at all times. Use the injected context above for continuity. Never narrate filesystem state, session infrastructure, or agent internals to the kid.",
      "</hi-bit:context>",
      "",
    ].join("\n");
  }

  return [
    "<hi-bit:context>",
    "mode: parent",
    `kid: { name: ${JSON.stringify(profile.name)}, age: ${profile.age} }`,
    `profile_dir: ${profileDir}`,
    `current_dream: ${currentDream}`,
    ...memoryLines,
    "",
    "You are Bit, the tutor defined in CLAUDE.md / AGENTS.md in your working directory. You are speaking to the parent, a technical adult who is your co-teacher. Use the injected context above for continuity. Speak directly and respectfully. Technical register is fine. No emoji, no kid-speak. Do not relay the kid's private struggles to the kid; do not relay the parent's private directives to the kid verbatim.",
    "</hi-bit:context>",
    "",
  ].join("\n");
}

function buildLearningPlanLines(plan: LearningPlanContext): string[] {
  const completingNextUpCompletesDream = doesCompletingNextUpCompleteDream(plan);
  const lines = [
    "",
    "<hi-bit:learning-plan>",
    "This is the current dream path from Hi-Bit's knowledge graph.",
    "Use these exact KP ids in hidden <hi-bit:progress> blocks. Do not invent KP ids.",
    "Use listed ids like html-text-headings, not tag names like h1.",
    "Before your visible reply ends, include a hidden <hi-bit:progress> block when this turn teaches or checks next_up.",
    "If next_up is not_started and you ask the kid to inspect or change related code, mark it saw_it in that hidden block first.",
    "If next_up is none, the current dream path is complete. Tell the kid to click Switch dream.",
    "Never mention hidden progress blocks to the kid.",
    `dream: ${plan.dream.id} - ${plan.dream.titleKid}`,
    `next_up: ${plan.nextUpKpId ?? "none"}`,
    `completing_next_up_completes_dream: ${completingNextUpCompletesDream ? "true" : "false"}`,
    ...(completingNextUpCompletesDream
      ? [
          "If you emit a hidden progress block that marks next_up as did_with_help, did_unprompted, or explained_it, the current dream path is complete. In that same visible reply, tell the kid to click Switch dream.",
        ]
      : []),
    "required_kps:",
  ];
  for (const kp of plan.requiredKps) {
    lines.push(`- ${kp.id} | ${kp.titleKid} | status: ${kp.status ?? "not_started"}`);
    if (kp.whyKid) lines.push(`  why: ${kp.whyKid}`);
    if (kp.masterySignals) {
      lines.push(
        `  mastery_signals: saw_it=${kp.masterySignals.saw_it}; did_with_help=${kp.masterySignals.did_with_help}; did_unprompted=${kp.masterySignals.did_unprompted}; explained_it=${kp.masterySignals.explained_it}`,
      );
    }
  }
  lines.push("</hi-bit:learning-plan>");
  return lines;
}

function doesCompletingNextUpCompleteDream(plan: LearningPlanContext): boolean {
  if (!plan.nextUpKpId) return false;
  if (!plan.requiredKps.some((kp) => kp.id === plan.nextUpKpId)) return false;
  return plan.requiredKps.every(
    (kp) => kp.id === plan.nextUpKpId || DREAM_COMPLETING_STATUSES.has(kp.status ?? ""),
  );
}

function buildCompactResumeContext(opts: BuildSessionContextOptions): string {
  const { role, profile } = opts;
  const currentDream = profile.currentDreamId ?? "no dream chosen yet";
  const learningPlanLines = opts.learningPlan ? buildLearningPlanLines(opts.learningPlan) : [];

  return [
    "<hi-bit:context>",
    `mode: ${role}`,
    `current_dream: ${currentDream}`,
    ...learningPlanLines,
    "</hi-bit:context>",
    "",
  ].join("\n");
}

function buildMemoryLines(memory: SessionMemoryContext): string[] {
  return [
    "",
    "<hi-bit:memory>",
    "These memory files were injected by Hi-Bit from the kid profile directory.",
    "Use them as context.",
    "Use these files as context. Update state.md directly only when the prompt says to. Do not edit progress.json directly; emit hidden <hi-bit:progress> blocks instead.",
    "",
    '<hi-bit:file path="state.md" format="markdown">',
    memory.stateMd.trimEnd(),
    "</hi-bit:file>",
    "",
    '<hi-bit:file path="progress.json" format="json">',
    memory.progressJson.trimEnd(),
    "</hi-bit:file>",
    "</hi-bit:memory>",
  ];
}

function buildProjectLines(
  profile: Profile,
  profileDir: string,
  projectFiles: string[] | undefined,
): string[] {
  if (!profile.currentDreamId || projectFiles === undefined) return [];
  const lines = [
    `project_dir: ${join(profileDir, "projects", profile.currentDreamId)}`,
    `project_files: ${JSON.stringify(projectFiles)}`,
  ];
  if (projectFiles.includes("index.html")) {
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
  if (opts.mode !== "start") {
    if (opts.role === "kid" && opts.learningPlan) {
      return `${buildCompactResumeContext(opts)}${opts.userPrompt}`;
    }
    return opts.userPrompt;
  }
  return `${buildSessionContextPreamble(opts)}\n${opts.userPrompt}`;
}
