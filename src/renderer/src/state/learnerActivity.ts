import {
  type ExpectedLearnerAction,
  LEARNER_ACTIVITY_DETAILS,
  type LearnerActivity,
} from "@shared/learnerActivity";

export type { ExpectedLearnerAction, LearnerActivity } from "@shared/learnerActivity";

const SYSTEM_NOTE_PREFIX = "[Hi-Bit system note - this is from the app UI, not from the kid]";

const ACTIVITY_DETAILS: Record<
  LearnerActivity["type"],
  { label: string; summary: string; guidance: string }
> = {
  "editor.opened": {
    label: LEARNER_ACTIVITY_DETAILS["editor.opened"].label,
    summary: "The kid just opened the code editor.",
    guidance:
      "Acknowledge that they are looking at the code editor. Briefly name what this area is for, then guide them to the next useful workspace step.",
  },
  "preview.opened": {
    label: LEARNER_ACTIVITY_DETAILS["preview.opened"].label,
    summary: "The kid just clicked See my page and opened the live preview.",
    guidance:
      "Acknowledge the live page, then help them connect the page they see to the code they are changing.",
  },
  "workspace.view.code": {
    label: LEARNER_ACTIVITY_DETAILS["workspace.view.code"].label,
    summary: "The kid just switched the workspace to Code view.",
    guidance: "Acknowledge that code is visible now, then guide the next small step.",
  },
  "workspace.view.preview": {
    label: LEARNER_ACTIVITY_DETAILS["workspace.view.preview"].label,
    summary: "The kid just switched the workspace to Page view.",
    guidance:
      "Acknowledge that they are looking at the page, and avoid giving code-edit instructions until code is visible again.",
  },
  "workspace.view.split": {
    label: LEARNER_ACTIVITY_DETAILS["workspace.view.split"].label,
    summary: "The kid just switched the workspace to Split view.",
    guidance:
      "Acknowledge that they can see code and page together, then guide the next small step.",
  },
};

export function learnerActivityLabel(activity: LearnerActivity): string {
  return ACTIVITY_DETAILS[activity.type].label;
}

export function expectedLearnerActionLabel(action: ExpectedLearnerAction): string {
  return action.label?.trim() || ACTIVITY_DETAILS[action.type].label;
}

export function buildLearnerActivityPrompt(activity: LearnerActivity): string {
  const detail = ACTIVITY_DETAILS[activity.type];
  return [
    SYSTEM_NOTE_PREFIX,
    `Activity: ${activity.type}`,
    detail.summary,
    detail.guidance,
    "Keep the reply short. Do not say this came from a system note or UI event.",
  ].join("\n");
}

export function learnerActivityPromptLabel(text: string): string | null {
  const lines = text.trimStart().split("\n");
  let cursor = 0;
  if (lines[cursor] === SYSTEM_NOTE_PREFIX) cursor += 1;
  const activityType = lines[cursor]?.match(/^Activity: (.+)$/)?.[1];
  if (!activityType || !(activityType in ACTIVITY_DETAILS)) return null;
  return ACTIVITY_DETAILS[activityType as LearnerActivity["type"]].label;
}

export function inferExpectedLearnerAction(text: string): ExpectedLearnerAction | null {
  const patterns: Array<{ action: ExpectedLearnerAction; patterns: RegExp[] }> = [
    {
      action: { type: "workspace.view.split", label: "Clicked Split", source: "inferred" },
      patterns: [/\b(click|press|tap)\s+Split\b/i],
    },
    {
      action: { type: "workspace.view.code", label: "Clicked Code", source: "inferred" },
      patterns: [/\b(click|press|tap)\s+Code\b/i, /\b(click|press|tap)\s+See my code\b/i],
    },
    {
      action: { type: "workspace.view.preview", label: "Clicked Page", source: "inferred" },
      patterns: [/\b(click|press|tap)\s+Page\b/i],
    },
    {
      action: { type: "preview.opened", label: "Opened page preview", source: "inferred" },
      patterns: [/\b(click|press|tap)\s+See my page\b/i],
    },
    {
      action: { type: "editor.opened", label: "Opened editor", source: "inferred" },
      patterns: [/\b(click|press|tap)\s+Open (the )?editor\b/i],
    },
  ];
  for (const candidate of patterns) {
    if (candidate.patterns.some((pattern) => pattern.test(text))) return candidate.action;
  }
  return null;
}
