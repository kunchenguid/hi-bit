import type { Progress } from "@shared/progress";
import { emptyProgress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { describeKpMasteryFirstSeen } from "./kpMasteryFirstSeen";

function makeProgress(
  entries: Record<string, Partial<Progress["knowledgePoints"][string]>> = {},
): Progress {
  const base = emptyProgress();
  for (const [id, patch] of Object.entries(entries)) {
    base.knowledgePoints[id] = {
      status: patch.status ?? "saw_it",
      firstSeenAt: patch.firstSeenAt ?? "2026-04-20T10:00:00.000Z",
      updatedAt: patch.updatedAt ?? "2026-04-23T09:55:00.000Z",
      ...(patch.evidence !== undefined ? { evidence: patch.evidence } : {}),
      ...(patch.skipped !== undefined ? { skipped: patch.skipped } : {}),
    };
  }
  return base;
}

describe("describeKpMasteryFirstSeen", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");

  it("returns null when progress is null", () => {
    expect(describeKpMasteryFirstSeen(null, "html-doc-shell", { now })).toBeNull();
  });

  it("returns null when the KP has no entry", () => {
    const progress = makeProgress({ "html-doc-shell": {} });
    expect(describeKpMasteryFirstSeen(progress, "css-colors", { now })).toBeNull();
  });

  it("returns null when kpId is empty", () => {
    const progress = makeProgress({ "html-doc-shell": {} });
    expect(describeKpMasteryFirstSeen(progress, "", { now })).toBeNull();
  });

  it("returns null when firstSeenAt is invalid", () => {
    const progress = makeProgress({
      "html-doc-shell": { firstSeenAt: "not-a-date" },
    });
    expect(describeKpMasteryFirstSeen(progress, "html-doc-shell", { now })).toBeNull();
  });

  it("returns null when firstSeenAt is empty", () => {
    const progress = makeProgress({ "html-doc-shell": { firstSeenAt: "" } });
    expect(describeKpMasteryFirstSeen(progress, "html-doc-shell", { now })).toBeNull();
  });

  it("returns null when firstSeenAt equals updatedAt (just-seen, no further progress)", () => {
    const progress = makeProgress({
      "html-doc-shell": {
        firstSeenAt: "2026-04-23T09:55:00.000Z",
        updatedAt: "2026-04-23T09:55:00.000Z",
      },
    });
    expect(describeKpMasteryFirstSeen(progress, "html-doc-shell", { now })).toBeNull();
  });

  it("returns days-ago phrasing when the KP was first seen a few days ago", () => {
    const progress = makeProgress({
      "html-doc-shell": {
        firstSeenAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-23T09:45:00.000Z",
      },
    });
    expect(describeKpMasteryFirstSeen(progress, "html-doc-shell", { now })).toEqual({
      firstSeenAt: "2026-04-20T10:00:00.000Z",
      relative: "3 days ago",
    });
  });

  it("returns minutes-ago phrasing for recent first-seens", () => {
    const progress = makeProgress({
      "html-doc-shell": {
        firstSeenAt: "2026-04-23T09:45:00.000Z",
        updatedAt: "2026-04-23T09:55:00.000Z",
      },
    });
    expect(describeKpMasteryFirstSeen(progress, "html-doc-shell", { now })).toEqual({
      firstSeenAt: "2026-04-23T09:45:00.000Z",
      relative: "15 minutes ago",
    });
  });

  it("works independently of skipped state", () => {
    const progress = makeProgress({
      "html-doc-shell": {
        firstSeenAt: "2026-04-21T10:00:00.000Z",
        updatedAt: "2026-04-23T09:30:00.000Z",
        skipped: true,
      },
    });
    expect(describeKpMasteryFirstSeen(progress, "html-doc-shell", { now })).toEqual({
      firstSeenAt: "2026-04-21T10:00:00.000Z",
      relative: "2 days ago",
    });
  });
});
