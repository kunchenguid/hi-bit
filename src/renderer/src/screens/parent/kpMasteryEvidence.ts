import type { Progress } from "@shared/progress";

export type KpMasteryEvidence = {
  text: string;
  preview: string;
};

export const KP_MASTERY_EVIDENCE_PREVIEW_MAX_CHARS = 120;

export function describeKpMasteryEvidence(
  progress: Progress | null,
  kpId: string,
): KpMasteryEvidence | null {
  if (!progress) return null;
  if (typeof kpId !== "string" || kpId.length === 0) return null;
  const entry = progress.knowledgePoints[kpId];
  if (!entry) return null;
  const raw = entry.evidence;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0) return null;
  const collapsed = text.replace(/\s+/g, " ");
  const preview =
    collapsed.length > KP_MASTERY_EVIDENCE_PREVIEW_MAX_CHARS
      ? `${collapsed.slice(0, KP_MASTERY_EVIDENCE_PREVIEW_MAX_CHARS - 3)}...`
      : collapsed;
  return { text, preview };
}
