import type { Progress } from "@shared/progress";

export type KpSkipState = {
  skipped: boolean;
  label: string;
  ariaLabel: string;
  nextSkipped: boolean;
};

export function describeKpSkip(
  progress: Progress | null,
  kpId: string,
  kpTitle: string,
): KpSkipState {
  const skipped = progress?.knowledgePoints[kpId]?.skipped === true;
  return {
    skipped,
    label: skipped ? "Skipped" : "Skip",
    ariaLabel: skipped
      ? `${kpTitle} is skipped. Click to un-skip.`
      : `Skip ${kpTitle}. Click to mark this knowledge point as skipped.`,
    nextSkipped: !skipped,
  };
}
