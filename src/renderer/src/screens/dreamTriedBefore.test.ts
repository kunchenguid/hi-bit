import { describe, expect, it } from "vitest";
import { describeDreamTriedBefore } from "./dreamTriedBefore";

describe("describeDreamTriedBefore", () => {
  it("returns null when dreamHistory is empty", () => {
    expect(describeDreamTriedBefore("snake", [], null)).toBe(null);
  });

  it("returns null when dream is not in history", () => {
    expect(describeDreamTriedBefore("pet-page", ["snake", "hello-card"], null)).toBe(null);
  });

  it("returns null when dream is current (current marker handles that)", () => {
    expect(describeDreamTriedBefore("snake", ["snake", "hello-card"], "snake")).toBe(null);
  });

  it("returns pill when dream is in history and not current", () => {
    expect(describeDreamTriedBefore("snake", ["snake", "hello-card"], "hello-card")).toEqual({
      kicker: "tried before",
      text: "you've opened this dream",
    });
  });

  it("returns pill when dream is in history and currentDreamId is null", () => {
    expect(describeDreamTriedBefore("snake", ["snake"], null)).toEqual({
      kicker: "tried before",
      text: "you've opened this dream",
    });
  });

  it("returns pill when dream is in history and currentDreamId is undefined", () => {
    expect(describeDreamTriedBefore("snake", ["snake"], undefined)).toEqual({
      kicker: "tried before",
      text: "you've opened this dream",
    });
  });

  it("returns null when dreamId is empty", () => {
    expect(describeDreamTriedBefore("", ["snake"], null)).toBe(null);
  });

  it("is case-sensitive on the id match", () => {
    expect(describeDreamTriedBefore("Snake", ["snake"], null)).toBe(null);
    expect(describeDreamTriedBefore("snake", ["Snake"], null)).toBe(null);
  });

  it("matches the first occurrence when dream appears multiple times in history", () => {
    expect(describeDreamTriedBefore("snake", ["snake", "pet-page", "snake"], "pet-page")).toEqual({
      kicker: "tried before",
      text: "you've opened this dream",
    });
  });

  it("does not mutate the passed dreamHistory", () => {
    const history = ["snake", "hello-card"];
    describeDreamTriedBefore("snake", history, null);
    expect(history).toEqual(["snake", "hello-card"]);
  });
});
