export const LEARNER_ACTIVITY_DETAILS = {
  "editor.opened": { label: "Opened editor" },
  "preview.opened": { label: "Opened page preview" },
  "workspace.view.code": { label: "Clicked Code" },
  "workspace.view.preview": { label: "Clicked Page" },
  "workspace.view.split": { label: "Clicked Split" },
} as const;

export type LearnerActivityType = keyof typeof LEARNER_ACTIVITY_DETAILS;

export type LearnerActivity = {
  type: LearnerActivityType;
};

export type ExpectedLearnerAction = {
  type: LearnerActivityType;
  label?: string;
  source?: "explicit" | "inferred" | "tour";
};

export function isLearnerActivityType(value: unknown): value is LearnerActivityType {
  return typeof value === "string" && value in LEARNER_ACTIVITY_DETAILS;
}
