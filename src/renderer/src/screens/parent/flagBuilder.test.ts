import type { ParentFlag } from "@shared/flag";
import type { TranscriptEvent } from "@shared/transcript";
import { describe, expect, it } from "vitest";
import { buildFlagFromEvent, findMatchingFlag } from "./flagBuilder";

function makeEvent(overrides: Partial<TranscriptEvent> = {}): TranscriptEvent {
  return {
    timestamp: "2026-04-23T09:45:00.000Z",
    role: "kid",
    sessionId: "sess-1",
    kind: "assistant_message",
    text: "lol just write it for you",
    ...overrides,
  };
}

describe("buildFlagFromEvent", () => {
  it("packs the event into a ParentFlag with the supplied reason", () => {
    const result = buildFlagFromEvent(
      makeEvent(),
      "sess-1",
      "do not write it without teaching",
      () => new Date("2026-04-23T10:15:00.000Z"),
    );
    expect(result).toEqual({
      ok: true,
      flag: {
        flaggedAt: "2026-04-23T10:15:00.000Z",
        sessionId: "sess-1",
        messageTimestamp: "2026-04-23T09:45:00.000Z",
        messageRole: "kid",
        messageKind: "assistant_message",
        messageText: "lol just write it for you",
        reason: "do not write it without teaching",
      } satisfies ParentFlag,
    });
  });

  it("trims the reason and rejects empty/whitespace input", () => {
    const ok = buildFlagFromEvent(makeEvent(), "sess-1", "  keep prompts simple  ");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.flag.reason).toBe("keep prompts simple");

    const empty = buildFlagFromEvent(makeEvent(), "sess-1", "   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatch(/reason/i);
  });

  it("rejects an event with empty text", () => {
    const result = buildFlagFromEvent(makeEvent({ text: "   " }), "sess-1", "no");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/text/i);
  });

  it("rejects an empty session id", () => {
    const result = buildFlagFromEvent(makeEvent(), "", "no");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/session/i);
  });
});

describe("findMatchingFlag", () => {
  const flag: ParentFlag = {
    flaggedAt: "2026-04-23T10:15:00.000Z",
    sessionId: "sess-1",
    messageTimestamp: "2026-04-23T09:45:00.000Z",
    messageRole: "kid",
    messageKind: "assistant_message",
    messageText: "lol just write it for you",
    reason: "do not write it without teaching",
  };

  it("returns the flag matching session+timestamp+text", () => {
    expect(findMatchingFlag([flag], makeEvent(), "sess-1")).toEqual(flag);
  });

  it("returns undefined when the session id differs", () => {
    expect(findMatchingFlag([flag], makeEvent(), "sess-2")).toBeUndefined();
  });

  it("returns undefined when the message text differs", () => {
    expect(findMatchingFlag([flag], makeEvent({ text: "different" }), "sess-1")).toBeUndefined();
  });

  it("returns undefined when the timestamp differs", () => {
    const other = makeEvent({ timestamp: "2026-04-23T11:00:00.000Z" });
    expect(findMatchingFlag([flag], other, "sess-1")).toBeUndefined();
  });
});
