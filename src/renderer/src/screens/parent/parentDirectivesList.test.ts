import { describe, expect, it } from "vitest";
import type { ParentChatMessage } from "../../state/parentChatStore";
import {
  buildParentDirectivesOverview,
  DEFAULT_DIRECTIVES_LIMIT,
  DIRECTIVE_PREVIEW_MAX_CHARS,
} from "./parentDirectivesList";

function makeMsg(overrides: Partial<ParentChatMessage> = {}): ParentChatMessage {
  return {
    id: "m-1",
    role: "parent",
    kind: "text",
    text: "focus on loops this week",
    timestamp: "2026-04-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildParentDirectivesOverview", () => {
  it("returns empty list for empty input", () => {
    expect(buildParentDirectivesOverview([])).toEqual([]);
  });

  it("filters out Bit replies (only parent messages are directives)", () => {
    const parentMsg = makeMsg({ id: "m-1", role: "parent", text: "focus on loops" });
    const bitMsg = makeMsg({ id: "m-2", role: "bit", text: "got it" });
    const out = buildParentDirectivesOverview([parentMsg, bitMsg]);
    expect(out.map((e) => e.id)).toEqual(["m-1"]);
  });

  it("filters out error messages", () => {
    const text = makeMsg({ id: "m-1", kind: "text" });
    const err = makeMsg({ id: "m-2", kind: "error", text: "Bit went to grab a snack." });
    expect(buildParentDirectivesOverview([text, err]).map((e) => e.id)).toEqual(["m-1"]);
  });

  it("sorts by timestamp descending (most recent first)", () => {
    const older = makeMsg({ id: "old", timestamp: "2026-04-20T10:00:00.000Z" });
    const newer = makeMsg({ id: "new", timestamp: "2026-04-20T12:00:00.000Z" });
    const middle = makeMsg({ id: "mid", timestamp: "2026-04-20T11:00:00.000Z" });
    const out = buildParentDirectivesOverview([older, middle, newer]);
    expect(out.map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it(`caps the list at ${DEFAULT_DIRECTIVES_LIMIT} entries by default`, () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeMsg({
        id: `m-${i}`,
        timestamp: `2026-04-20T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
      }),
    );
    const out = buildParentDirectivesOverview(many);
    expect(out).toHaveLength(DEFAULT_DIRECTIVES_LIMIT);
    expect(out[0]?.id).toBe("m-11");
  });

  it("respects a custom limit parameter", () => {
    const msgs = [
      makeMsg({ id: "a", timestamp: "2026-04-20T10:00:00.000Z" }),
      makeMsg({ id: "b", timestamp: "2026-04-20T11:00:00.000Z" }),
      makeMsg({ id: "c", timestamp: "2026-04-20T12:00:00.000Z" }),
    ];
    const out = buildParentDirectivesOverview(msgs, 2);
    expect(out.map((e) => e.id)).toEqual(["c", "b"]);
  });

  it("truncates long directive text to the preview limit with ellipsis", () => {
    const longText = "word ".repeat(100);
    const entry = buildParentDirectivesOverview([makeMsg({ text: longText })])[0];
    expect(entry).toBeDefined();
    expect(entry?.preview.length).toBeLessThanOrEqual(DIRECTIVE_PREVIEW_MAX_CHARS);
    expect(entry?.preview.endsWith("...")).toBe(true);
    expect(entry?.text).toBe(longText);
  });

  it("collapses newlines into spaces in preview but preserves raw text", () => {
    const entry = buildParentDirectivesOverview([makeMsg({ text: "line one\n\nline two" })])[0];
    expect(entry?.preview).toBe("line one line two");
    expect(entry?.text).toBe("line one\n\nline two");
  });

  it("returns the full sorted list when limit is 0", () => {
    const msgs = [
      makeMsg({ id: "a", timestamp: "2026-04-20T10:00:00.000Z" }),
      makeMsg({ id: "b", timestamp: "2026-04-20T11:00:00.000Z" }),
      makeMsg({ id: "c", timestamp: "2026-04-20T12:00:00.000Z" }),
    ];
    const out = buildParentDirectivesOverview(msgs, 0);
    expect(out.map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});
