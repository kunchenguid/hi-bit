import { describe, expect, it } from "vitest";
import { expandInterests } from "./interestAliases";

describe("expandInterests", () => {
  it("returns an empty set when given no interests", () => {
    expect(expandInterests([])).toEqual(new Set<string>());
  });

  it("returns an empty set when interests are only whitespace", () => {
    expect(expandInterests(["", "  ", "\t"])).toEqual(new Set<string>());
  });

  it("preserves the original interest as-is when no alias is known", () => {
    const result = expandInterests(["robots"]);
    expect(result.has("robots")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("expands ski into the sports tag without dropping the original", () => {
    const result = expandInterests(["ski"]);
    expect(result.has("ski")).toBe(true);
    expect(result.has("sports")).toBe(true);
  });

  it("expands piano into both music and keyboard tags", () => {
    const result = expandInterests(["piano"]);
    expect(result.has("piano")).toBe(true);
    expect(result.has("music")).toBe(true);
    expect(result.has("keyboard")).toBe(true);
  });

  it("normalizes aliases case-insensitively and trims whitespace", () => {
    const result = expandInterests(["  PIANO  "]);
    expect(result.has("piano")).toBe(true);
    expect(result.has("music")).toBe(true);
    expect(result.has("keyboard")).toBe(true);
  });

  it("expands multiple interests independently", () => {
    const result = expandInterests(["chess", "ski", "piano"]);
    expect(result.has("chess")).toBe(true);
    expect(result.has("ski")).toBe(true);
    expect(result.has("piano")).toBe(true);
    expect(result.has("sports")).toBe(true);
    expect(result.has("music")).toBe(true);
    expect(result.has("keyboard")).toBe(true);
  });

  it("expands cats into pets and animals", () => {
    const result = expandInterests(["cats"]);
    expect(result.has("cats")).toBe(true);
    expect(result.has("pets")).toBe(true);
    expect(result.has("animals")).toBe(true);
  });

  it("expands legos into building", () => {
    const result = expandInterests(["legos"]);
    expect(result.has("legos")).toBe(true);
    expect(result.has("building")).toBe(true);
  });

  it("does not introduce a tag when the alias would be empty after normalization", () => {
    const result = expandInterests(["robots", ""]);
    expect(result.size).toBe(1);
    expect(result.has("robots")).toBe(true);
  });
});
