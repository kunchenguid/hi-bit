import type { NextKpSuggestion } from "./parent/nextKpSuggestion";

export type KidNextUpDescription = {
  label: string;
  text: string;
  subtext?: string;
};

export function describeKidNextUp(
  suggestion: NextKpSuggestion | null,
): KidNextUpDescription | null {
  if (!suggestion) return null;
  if (suggestion.kind === "next-kp") {
    const why = suggestion.kp.why_kid?.trim();
    return {
      label: "Up next",
      text: suggestion.kp.title_kid,
      ...(why ? { subtext: why } : {}),
    };
  }
  if (suggestion.kind === "all-done") {
    return { label: "Up next", text: "ready to build!" };
  }
  return null;
}
