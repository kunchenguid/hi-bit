import type { DreamReadiness } from "./dreamReadiness";

export type DreamRequiresWarning = {
  kicker: string;
  text: string;
};

export function describeDreamRequiresWarning(
  readiness: DreamReadiness,
): DreamRequiresWarning | null {
  if (readiness.unknownCount <= 0) return null;
  const noun = readiness.unknownCount === 1 ? "skill" : "skills";
  return {
    kicker: "heads up",
    text: `${readiness.unknownCount} missing ${noun} in the graph`,
  };
}
