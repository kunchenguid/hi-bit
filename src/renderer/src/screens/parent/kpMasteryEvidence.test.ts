import type { Progress } from "@shared/progress";
import { emptyProgress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import {
  describeKpMasteryEvidence,
  KP_MASTERY_EVIDENCE_PREVIEW_MAX_CHARS,
} from "./kpMasteryEvidence";

function makeProgress(
  entries: Record<string, Partial<Progress["knowledgePoints"][string]>> = {},
): Progress {
  const base = emptyProgress();
  for (const [id, patch] of Object.entries(entries)) {
    base.knowledgePoints[id] = {
      status: patch.status ?? "saw_it",
      firstSeenAt: patch.firstSeenAt ?? "2026-04-01T10:00:00.000Z",
      updatedAt: patch.updatedAt ?? "2026-04-23T09:55:00.000Z",
      ...(patch.evidence !== undefined ? { evidence: patch.evidence } : {}),
      ...(patch.skipped !== undefined ? { skipped: patch.skipped } : {}),
    };
  }
  return base;
}

describe("describeKpMasteryEvidence", () => {
  it("returns null when progress is null", () => {
    expect(describeKpMasteryEvidence(null, "html-doc-shell")).toBeNull();
  });

  it("returns null when the KP has no entry", () => {
    const progress = makeProgress({ "html-doc-shell": { evidence: "Kid explained it" } });
    expect(describeKpMasteryEvidence(progress, "css-colors")).toBeNull();
  });

  it("returns null when kpId is empty", () => {
    const progress = makeProgress({ "html-doc-shell": { evidence: "Kid explained it" } });
    expect(describeKpMasteryEvidence(progress, "")).toBeNull();
  });

  it("returns null when evidence is missing from the entry", () => {
    const progress = makeProgress({ "html-doc-shell": {} });
    expect(describeKpMasteryEvidence(progress, "html-doc-shell")).toBeNull();
  });

  it("returns null when evidence is empty", () => {
    const progress = makeProgress({ "html-doc-shell": { evidence: "" } });
    expect(describeKpMasteryEvidence(progress, "html-doc-shell")).toBeNull();
  });

  it("returns null when evidence is only whitespace", () => {
    const progress = makeProgress({ "html-doc-shell": { evidence: "   \n\t  " } });
    expect(describeKpMasteryEvidence(progress, "html-doc-shell")).toBeNull();
  });

  it("returns trimmed evidence text with matching preview for short content", () => {
    const progress = makeProgress({
      "html-doc-shell": { evidence: "  Kid built a page from memory  " },
    });
    expect(describeKpMasteryEvidence(progress, "html-doc-shell")).toEqual({
      text: "Kid built a page from memory",
      preview: "Kid built a page from memory",
    });
  });

  it("collapses newlines and extra whitespace in the preview but preserves raw text", () => {
    const progress = makeProgress({
      "html-doc-shell": { evidence: "Kid typed\n\nthe tag twice\n    without help" },
    });
    expect(describeKpMasteryEvidence(progress, "html-doc-shell")).toEqual({
      text: "Kid typed\n\nthe tag twice\n    without help",
      preview: "Kid typed the tag twice without help",
    });
  });

  it("truncates preview over the max with an ellipsis while keeping full text", () => {
    const long = "a".repeat(KP_MASTERY_EVIDENCE_PREVIEW_MAX_CHARS + 20);
    const progress = makeProgress({ "html-doc-shell": { evidence: long } });
    const result = describeKpMasteryEvidence(progress, "html-doc-shell");
    expect(result?.text).toBe(long);
    expect(result?.preview.length).toBe(KP_MASTERY_EVIDENCE_PREVIEW_MAX_CHARS);
    expect(result?.preview.endsWith("...")).toBe(true);
  });

  it("works independently of skipped state", () => {
    const progress = makeProgress({
      "html-doc-shell": { evidence: "Showed it to grandma", skipped: true },
    });
    expect(describeKpMasteryEvidence(progress, "html-doc-shell")).toEqual({
      text: "Showed it to grandma",
      preview: "Showed it to grandma",
    });
  });
});
