import type { ParentFlag } from "@shared/flag";
import { describe, expect, it } from "vitest";
import { describeFlagMessageTime } from "./flagMessageTime";

function makeFlag(overrides: Partial<ParentFlag> = {}): ParentFlag {
  return {
    flaggedAt: "2026-04-23T10:00:00.000Z",
    sessionId: "sess-abc",
    messageTimestamp: "2026-04-23T09:30:00.000Z",
    messageRole: "kid",
    messageKind: "assistant_message",
    messageText: "hello",
    reason: "too long",
    ...overrides,
  };
}

describe("describeFlagMessageTime", () => {
  const now = new Date("2026-04-23T10:00:00.000Z");

  it("returns null when flag is null", () => {
    expect(describeFlagMessageTime(null, { now })).toBeNull();
  });

  it("returns null when flag is undefined", () => {
    expect(describeFlagMessageTime(undefined, { now })).toBeNull();
  });

  it("returns null when messageTimestamp is empty", () => {
    const flag = makeFlag({ messageTimestamp: "" });
    expect(describeFlagMessageTime(flag, { now })).toBeNull();
  });

  it("returns null when messageTimestamp is not a parseable date", () => {
    const flag = makeFlag({ messageTimestamp: "not-a-date" });
    expect(describeFlagMessageTime(flag, { now })).toBeNull();
  });

  it("returns null when messageTimestamp equals flaggedAt (flagged-while-live, no span)", () => {
    const flag = makeFlag({
      messageTimestamp: "2026-04-23T10:00:00.000Z",
      flaggedAt: "2026-04-23T10:00:00.000Z",
    });
    expect(describeFlagMessageTime(flag, { now })).toBeNull();
  });

  it("returns minutes-ago phrasing when the message was sent minutes before now", () => {
    const flag = makeFlag({
      messageTimestamp: "2026-04-23T09:30:00.000Z",
      flaggedAt: "2026-04-23T09:58:00.000Z",
    });
    expect(describeFlagMessageTime(flag, { now })).toEqual({
      messageTimestamp: "2026-04-23T09:30:00.000Z",
      relative: "30 minutes ago",
    });
  });

  it("returns hours-ago phrasing when the message was sent hours before", () => {
    const flag = makeFlag({
      messageTimestamp: "2026-04-23T07:00:00.000Z",
      flaggedAt: "2026-04-23T09:58:00.000Z",
    });
    expect(describeFlagMessageTime(flag, { now })).toEqual({
      messageTimestamp: "2026-04-23T07:00:00.000Z",
      relative: "3 hours ago",
    });
  });

  it("returns days-ago phrasing when the message was sent days before", () => {
    const flag = makeFlag({
      messageTimestamp: "2026-04-20T10:00:00.000Z",
      flaggedAt: "2026-04-23T09:58:00.000Z",
    });
    expect(describeFlagMessageTime(flag, { now })).toEqual({
      messageTimestamp: "2026-04-20T10:00:00.000Z",
      relative: "3 days ago",
    });
  });

  it("works independently of messageKind (assistant_message vs user_message)", () => {
    const flag = makeFlag({
      messageKind: "user_message",
      messageRole: "parent",
      messageTimestamp: "2026-04-22T10:00:00.000Z",
      flaggedAt: "2026-04-23T09:58:00.000Z",
    });
    expect(describeFlagMessageTime(flag, { now })).toEqual({
      messageTimestamp: "2026-04-22T10:00:00.000Z",
      relative: "1 day ago",
    });
  });
});
