import { describe, expect, it } from "vitest";
import { describeDreamCurrentMarker } from "./dreamCurrentMarker";

describe("describeDreamCurrentMarker", () => {
  it("returns null when currentDreamId is null", () => {
    expect(describeDreamCurrentMarker("snake", null)).toBe(null);
  });

  it("returns null when currentDreamId is undefined", () => {
    expect(describeDreamCurrentMarker("snake", undefined)).toBe(null);
  });

  it("returns null when currentDreamId is empty string", () => {
    expect(describeDreamCurrentMarker("snake", "")).toBe(null);
  });

  it("returns null when dreamId does not match currentDreamId", () => {
    expect(describeDreamCurrentMarker("pet-page", "snake")).toBe(null);
  });

  it("returns null when dreamId is empty", () => {
    expect(describeDreamCurrentMarker("", "snake")).toBe(null);
  });

  it("returns pill when dreamId matches currentDreamId", () => {
    expect(describeDreamCurrentMarker("snake", "snake")).toEqual({
      kicker: "current",
      text: "you're building this now",
    });
  });

  it("is case-sensitive on the id match", () => {
    expect(describeDreamCurrentMarker("Snake", "snake")).toBe(null);
    expect(describeDreamCurrentMarker("snake", "Snake")).toBe(null);
  });

  it("treats whitespace-padded dream ids as non-matching", () => {
    expect(describeDreamCurrentMarker(" snake", "snake")).toBe(null);
    expect(describeDreamCurrentMarker("snake", " snake")).toBe(null);
  });
});
