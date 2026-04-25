import type { Progress } from "@shared/progress";
import { emptyProgress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { describeKpMasteryUpdated } from "./kpMasteryUpdated";

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

describe("describeKpMasteryUpdated", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");

  it("returns null when progress is null", () => {
    expect(describeKpMasteryUpdated(null, "html-doc-shell", { now })).toBeNull();
  });

  it("returns null when the KP has no entry", () => {
    const progress = makeProgress({ "html-doc-shell": { updatedAt: "2026-04-23T09:55:00.000Z" } });
    expect(describeKpMasteryUpdated(progress, "css-colors", { now })).toBeNull();
  });

  it("returns null when kpId is empty", () => {
    const progress = makeProgress({ "html-doc-shell": {} });
    expect(describeKpMasteryUpdated(progress, "", { now })).toBeNull();
  });

  it("returns null when updatedAt is invalid", () => {
    const progress = makeProgress({ "html-doc-shell": { updatedAt: "not-a-date" } });
    expect(describeKpMasteryUpdated(progress, "html-doc-shell", { now })).toBeNull();
  });

  it("returns null when updatedAt is empty", () => {
    const progress = makeProgress({ "html-doc-shell": { updatedAt: "" } });
    expect(describeKpMasteryUpdated(progress, "html-doc-shell", { now })).toBeNull();
  });

  it("returns 'Just now' for very recent updates", () => {
    const progress = makeProgress({
      "html-doc-shell": { updatedAt: "2026-04-23T09:59:50.000Z" },
    });
    const result = describeKpMasteryUpdated(progress, "html-doc-shell", { now });
    expect(result).toEqual({
      updatedAt: "2026-04-23T09:59:50.000Z",
      relative: "Just now",
    });
  });

  it("returns minutes-ago phrasing within the last hour", () => {
    const progress = makeProgress({
      "html-doc-shell": { updatedAt: "2026-04-23T09:45:00.000Z" },
    });
    expect(describeKpMasteryUpdated(progress, "html-doc-shell", { now })).toEqual({
      updatedAt: "2026-04-23T09:45:00.000Z",
      relative: "15 minutes ago",
    });
  });

  it("returns days-ago phrasing for recent days", () => {
    const progress = makeProgress({
      "html-doc-shell": { updatedAt: "2026-04-20T10:00:00.000Z" },
    });
    expect(describeKpMasteryUpdated(progress, "html-doc-shell", { now })).toEqual({
      updatedAt: "2026-04-20T10:00:00.000Z",
      relative: "3 days ago",
    });
  });

  it("works independently of skipped state", () => {
    const progress = makeProgress({
      "html-doc-shell": {
        updatedAt: "2026-04-23T09:30:00.000Z",
        skipped: true,
      },
    });
    expect(describeKpMasteryUpdated(progress, "html-doc-shell", { now })).toEqual({
      updatedAt: "2026-04-23T09:30:00.000Z",
      relative: "30 minutes ago",
    });
  });
});
