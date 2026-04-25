import type { ParentFlag } from "@shared/flag";
import { describe, expect, it } from "vitest";
import {
  countParentFlagsBySpeakerFilter,
  filterParentFlagsBySpeaker,
  PARENT_FLAGS_FILTER_LABELS,
  PARENT_FLAGS_FILTERS,
} from "./parentFlagsFilter";
import { buildParentFlagsOverview } from "./parentFlagsList";

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

describe("PARENT_FLAGS_FILTERS", () => {
  it("exposes the four filter options in a stable order", () => {
    expect(PARENT_FLAGS_FILTERS).toEqual(["all", "kid", "bit", "parent"]);
  });

  it("ships a label for each filter id", () => {
    for (const id of PARENT_FLAGS_FILTERS) {
      expect(typeof PARENT_FLAGS_FILTER_LABELS[id]).toBe("string");
      expect(PARENT_FLAGS_FILTER_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe("filterParentFlagsBySpeaker", () => {
  it("returns a new array (not the input reference) on 'all'", () => {
    const entries = buildParentFlagsOverview([makeFlag()]);
    const out = filterParentFlagsBySpeaker(entries, "all");
    expect(out).toEqual(entries);
    expect(out).not.toBe(entries);
  });

  it("preserves order on 'all'", () => {
    const a = makeFlag({ flaggedAt: "2026-04-20T10:00:00.000Z", reason: "a" });
    const b = makeFlag({ flaggedAt: "2026-04-20T11:00:00.000Z", reason: "b" });
    const c = makeFlag({ flaggedAt: "2026-04-20T12:00:00.000Z", reason: "c" });
    const entries = buildParentFlagsOverview([a, b, c]);
    const out = filterParentFlagsBySpeaker(entries, "all");
    expect(out.map((e) => e.flag.reason)).toEqual(["c", "b", "a"]);
  });

  it("keeps only kid-authored user messages for 'kid'", () => {
    const kidMsg = makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "k" });
    const bitMsg = makeFlag({ messageKind: "assistant_message", reason: "b" });
    const parentMsg = makeFlag({
      messageRole: "parent",
      messageKind: "user_message",
      reason: "p",
      flaggedAt: "2026-04-20T11:00:00.000Z",
    });
    const entries = buildParentFlagsOverview([kidMsg, bitMsg, parentMsg]);
    const out = filterParentFlagsBySpeaker(entries, "kid");
    expect(out.map((e) => e.flag.reason)).toEqual(["k"]);
  });

  it("keeps only assistant messages for 'bit' regardless of session role", () => {
    const kidSession = makeFlag({
      messageRole: "kid",
      messageKind: "assistant_message",
      reason: "ks",
    });
    const parentSession = makeFlag({
      messageRole: "parent",
      messageKind: "assistant_message",
      reason: "ps",
      flaggedAt: "2026-04-20T11:00:00.000Z",
    });
    const kidMsg = makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "km" });
    const entries = buildParentFlagsOverview([kidSession, parentSession, kidMsg]);
    const out = filterParentFlagsBySpeaker(entries, "bit");
    expect(out.map((e) => e.flag.reason)).toEqual(["ks", "ps"]);
  });

  it("keeps only parent-authored user messages for 'parent'", () => {
    const parentMsg = makeFlag({ messageRole: "parent", messageKind: "user_message", reason: "p" });
    const kidMsg = makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "k" });
    const bitMsg = makeFlag({ messageKind: "assistant_message", reason: "b" });
    const entries = buildParentFlagsOverview([parentMsg, kidMsg, bitMsg]);
    const out = filterParentFlagsBySpeaker(entries, "parent");
    expect(out.map((e) => e.flag.reason)).toEqual(["p"]);
  });

  it("excludes non-chat kinds (tool_call, tool_result, error) from all specific speakers", () => {
    const toolCall = makeFlag({ messageKind: "tool_call", reason: "tc" });
    const toolResult = makeFlag({
      messageKind: "tool_result",
      reason: "tr",
      flaggedAt: "2026-04-20T11:00:00.000Z",
    });
    const error = makeFlag({
      messageKind: "error",
      reason: "er",
      flaggedAt: "2026-04-20T10:00:00.000Z",
    });
    const entries = buildParentFlagsOverview([toolCall, toolResult, error]);
    expect(filterParentFlagsBySpeaker(entries, "kid")).toEqual([]);
    expect(filterParentFlagsBySpeaker(entries, "bit")).toEqual([]);
    expect(filterParentFlagsBySpeaker(entries, "parent")).toEqual([]);
    expect(filterParentFlagsBySpeaker(entries, "all")).toHaveLength(3);
  });

  it("returns an empty list for empty input at every filter", () => {
    for (const id of PARENT_FLAGS_FILTERS) {
      expect(filterParentFlagsBySpeaker([], id)).toEqual([]);
    }
  });

  it("does not mutate its input", () => {
    const entries = buildParentFlagsOverview([
      makeFlag({ messageKind: "assistant_message", reason: "b" }),
      makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "k" }),
    ]);
    const snapshot = entries.map((e) => e.flag.reason);
    filterParentFlagsBySpeaker(entries, "bit");
    expect(entries.map((e) => e.flag.reason)).toEqual(snapshot);
  });
});

describe("countParentFlagsBySpeakerFilter", () => {
  it("returns all-zeros for empty input", () => {
    expect(countParentFlagsBySpeakerFilter([])).toEqual({ all: 0, kid: 0, bit: 0, parent: 0 });
  });

  it("maps 'all' to entries.length", () => {
    const entries = buildParentFlagsOverview([
      makeFlag({ messageKind: "tool_call", reason: "tc" }),
      makeFlag({ messageKind: "assistant_message", reason: "b" }),
    ]);
    expect(countParentFlagsBySpeakerFilter(entries).all).toBe(2);
  });

  it("counts per speaker via the same predicate as filterParentFlagsBySpeaker", () => {
    const entries = buildParentFlagsOverview([
      makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "k1" }),
      makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "k2" }),
      makeFlag({ messageKind: "assistant_message", reason: "b1" }),
      makeFlag({ messageRole: "parent", messageKind: "user_message", reason: "p1" }),
      makeFlag({ messageKind: "tool_call", reason: "tc" }),
    ]);
    expect(countParentFlagsBySpeakerFilter(entries)).toEqual({
      all: 5,
      kid: 2,
      bit: 1,
      parent: 1,
    });
  });

  it("does not mutate its input", () => {
    const entries = buildParentFlagsOverview([
      makeFlag({ messageRole: "kid", messageKind: "user_message", reason: "k" }),
      makeFlag({ messageKind: "assistant_message", reason: "b" }),
    ]);
    const snapshot = entries.map((e) => e.flag.reason);
    countParentFlagsBySpeakerFilter(entries);
    expect(entries.map((e) => e.flag.reason)).toEqual(snapshot);
  });
});
