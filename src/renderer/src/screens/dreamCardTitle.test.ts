import { describe, expect, it } from "vitest";
import { formatDreamCardTitle } from "./dreamCardTitle";

describe("formatDreamCardTitle", () => {
  it("returns empty string when input is empty", () => {
    expect(formatDreamCardTitle("")).toBe("");
  });

  it("returns empty string when input is only whitespace", () => {
    expect(formatDreamCardTitle("   ")).toBe("");
  });

  it("uppercases the first letter of a lowercase title", () => {
    expect(formatDreamCardTitle("a page all about you")).toBe("A page all about you.");
  });

  it("preserves existing capitalization beyond the first character", () => {
    expect(formatDreamCardTitle("a page about your iPad and macOS")).toBe(
      "A page about your iPad and macOS.",
    );
  });

  it("appends a period when no terminal punctuation is present", () => {
    expect(formatDreamCardTitle("a dice roller")).toBe("A dice roller.");
  });

  it("preserves a trailing period and does not double it", () => {
    expect(formatDreamCardTitle("a dice roller.")).toBe("A dice roller.");
  });

  it("preserves a trailing exclamation mark", () => {
    expect(formatDreamCardTitle("hello world!")).toBe("Hello world!");
  });

  it("preserves a trailing question mark", () => {
    expect(formatDreamCardTitle("what is this?")).toBe("What is this?");
  });

  it("trims surrounding whitespace before sentence-casing", () => {
    expect(formatDreamCardTitle("   a page about you   ")).toBe("A page about you.");
  });

  it("leaves an already capitalized first letter intact", () => {
    expect(formatDreamCardTitle("Already Capitalized")).toBe("Already Capitalized.");
  });

  it("is idempotent when applied twice", () => {
    const once = formatDreamCardTitle("a page all about you");
    expect(formatDreamCardTitle(once)).toBe(once);
  });
});
