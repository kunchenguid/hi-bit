export type KidWrapUpSummary = {
  title: string;
  subtitle: string;
};

export function buildKidWrapUpSummary(input: {
  profileName: string;
  kidMessageCount: number;
  doneSkillCount: number;
}): KidWrapUpSummary {
  const trimmedName = input.profileName.trim();
  const name = trimmedName.length > 0 ? trimmedName : "friend";
  const title = `Great work today, ${name}!`;

  const messagePart =
    input.kidMessageCount > 0
      ? `chatted with Bit ${input.kidMessageCount} ${input.kidMessageCount === 1 ? "time" : "times"}`
      : null;
  const skillPart =
    input.doneSkillCount > 0
      ? `learned ${input.doneSkillCount} new ${input.doneSkillCount === 1 ? "skill" : "skills"}`
      : null;

  let subtitle: string;
  if (messagePart && skillPart) {
    subtitle = `You ${messagePart} and ${skillPart}. Your work is saved.`;
  } else if (messagePart) {
    subtitle = `You ${messagePart}. Your work is saved.`;
  } else if (skillPart) {
    subtitle = `You ${skillPart}. Your work is saved.`;
  } else {
    subtitle = "Your work is saved. Come back any time!";
  }

  return { title, subtitle };
}
