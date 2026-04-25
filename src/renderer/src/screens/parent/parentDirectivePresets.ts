export type ParentDirectivePreset = {
  id: string;
  label: string;
  build: (kidName: string) => string;
};

export const PARENT_DIRECTIVE_PRESETS: readonly ParentDirectivePreset[] = [
  {
    id: "summarize-last-three",
    label: "Summarize last 3 sessions",
    build: (name) => `Summarize ${name}'s last three sessions.`,
  },
  {
    id: "what-was-hard",
    label: "What did they find hard?",
    build: (name) => `What did ${name} find hard today?`,
  },
  {
    id: "focus-this-week",
    label: "Focus on functions this week",
    build: () => "This week focus on functions.",
  },
  {
    id: "skip-known",
    label: "Already knows CSS colors - skip",
    build: (name) => `${name} already knows CSS colors from school, skip those.`,
  },
];

export function resolveDirectivePreset(presetId: string, kidName: string): string | null {
  const trimmed = kidName.trim();
  const name = trimmed.length > 0 ? trimmed : "the kid";
  const match = PARENT_DIRECTIVE_PRESETS.find((p) => p.id === presetId);
  return match ? match.build(name) : null;
}
