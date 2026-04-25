import type { ParentFlag } from "@shared/flag";
import { describe, expect, it } from "vitest";
import { buildParentFlagsOverview, FLAG_PREVIEW_MAX_CHARS } from "./parentFlagsList";

function makeFlag(overrides: Partial<ParentFlag> = {}): ParentFlag {
  return {
    flaggedAt: "2026-04-20T12:00:00.000Z",
    sessionId: "sess-1",
    messageTimestamp: "2026-04-20T11:59:00.000Z",
    messageRole: "kid",
    messageKind: "assistant_message",
    messageText: "Bit said something.",
    reason: "Looked wrong.",
    ...overrides,
  };
}

describe("buildParentFlagsOverview", () => {
  it("returns empty list for empty input", () => {
    expect(buildParentFlagsOverview([])).toEqual([]);
  });

  it("sorts by flaggedAt descending (most recent first)", () => {
    const older = makeFlag({ flaggedAt: "2026-04-20T10:00:00.000Z", reason: "old" });
    const newer = makeFlag({ flaggedAt: "2026-04-20T12:00:00.000Z", reason: "new" });
    const middle = makeFlag({ flaggedAt: "2026-04-20T11:00:00.000Z", reason: "middle" });
    const out = buildParentFlagsOverview([older, middle, newer]);
    expect(out.map((e) => e.flag.reason)).toEqual(["new", "middle", "old"]);
  });

  it("labels Bit for assistant_message regardless of role", () => {
    const kidSession = makeFlag({ messageRole: "kid", messageKind: "assistant_message" });
    const parentSession = makeFlag({ messageRole: "parent", messageKind: "assistant_message" });
    const [a, b] = buildParentFlagsOverview([kidSession, parentSession]);
    expect(a?.speakerLabel).toBe("Bit said");
    expect(b?.speakerLabel).toBe("Bit said");
  });

  it("labels Kid or Parent for user_message based on session role", () => {
    const kid = makeFlag({ messageRole: "kid", messageKind: "user_message" });
    const parent = makeFlag({
      messageRole: "parent",
      messageKind: "user_message",
      flaggedAt: "2026-04-20T10:00:00.000Z",
    });
    const out = buildParentFlagsOverview([kid, parent]);
    expect(out.map((e) => e.speakerLabel)).toEqual(["Kid said", "Parent said"]);
  });

  it("truncates long message text to the preview limit with ellipsis", () => {
    const longText = "word ".repeat(100);
    const entry = buildParentFlagsOverview([makeFlag({ messageText: longText })])[0];
    expect(entry).toBeDefined();
    expect(entry?.preview.length).toBeLessThanOrEqual(FLAG_PREVIEW_MAX_CHARS);
    expect(entry?.preview.endsWith("...")).toBe(true);
  });

  it("collapses newlines into spaces in preview", () => {
    const entry = buildParentFlagsOverview([makeFlag({ messageText: "line one\n\nline two" })])[0];
    expect(entry?.preview).toBe("line one line two");
  });

  it("preserves the original flag reference so callers can pass it to Unflag", () => {
    const flag = makeFlag({ reason: "x" });
    const out = buildParentFlagsOverview([flag]);
    expect(out[0]?.flag).toBe(flag);
  });
});
