import type { MasterySummary } from "./parent/masterySummary";

export type KidSkillsDescription = {
  kicker: string;
  text: string;
};

export function describeKidSkillsSummary(summary: MasterySummary): KidSkillsDescription | null {
  if (summary.mastered > 0) {
    return {
      kicker: "skills",
      text: `${summary.mastered} learned${summary.inProgress > 0 ? ` - ${summary.inProgress} in progress` : ""}`,
    };
  }
  if (summary.inProgress > 0) {
    return {
      kicker: "skills",
      text: `${summary.inProgress} in progress`,
    };
  }
  return null;
}
