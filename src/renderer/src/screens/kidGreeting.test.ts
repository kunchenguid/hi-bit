import { describe, expect, it } from "vitest";
import { buildKidGreetingText } from "./kidGreeting";

describe("buildKidGreetingText", () => {
  it("includes the kid's name, dream title, and the first knowledge point", () => {
    const text = buildKidGreetingText({
      profileName: "Eddie",
      dreamTitleKid: "a page all about you",
      nextUpText: "the frame that holds your page",
    });
    expect(text).toBe(
      'Hey Eddie! Ready to build a page all about you? We\'ll start with the frame that holds your page. Type "ready" when you want to go.',
    );
  });

  it("falls back gracefully when the dream is missing", () => {
    const text = buildKidGreetingText({
      profileName: "Ada",
      dreamTitleKid: null,
      nextUpText: "the frame that holds your page",
    });
    expect(text).toContain("Hey Ada!");
    expect(text).not.toMatch(/Ready to build/);
    expect(text).toContain("We'll start with");
    expect(text).toContain('Type "ready"');
  });

  it("falls back gracefully when the next-up KP is missing", () => {
    const text = buildKidGreetingText({
      profileName: "Ada",
      dreamTitleKid: "a dice page",
      nextUpText: null,
    });
    expect(text).toContain("Hey Ada!");
    expect(text).toContain("Ready to build a dice page?");
    expect(text).not.toMatch(/We'll start with/);
    expect(text).toContain('Type "ready"');
  });

  it("does not turn all-done text into a start-with sentence", () => {
    const text = buildKidGreetingText({
      profileName: "Mia",
      dreamTitleKid: "a dice page",
      nextUpText: "ready to build!",
    });
    expect(text).not.toContain("We'll start with ready to build!");
    expect(text).toBe('Hey Mia! Ready to build a dice page? Type "ready" when you want to go.');
  });

  it("never produces ALL CAPS", () => {
    const text = buildKidGreetingText({
      profileName: "Eddie",
      dreamTitleKid: "a page all about you",
      nextUpText: "the frame that holds your page",
    });
    expect(text).not.toMatch(/[A-Z]{4,}/);
  });

  it("handles a missing/blank profile name without throwing", () => {
    const text = buildKidGreetingText({
      profileName: "  ",
      dreamTitleKid: "a dice page",
      nextUpText: "the frame that holds your page",
    });
    expect(text.startsWith("Hey!")).toBe(true);
  });
});
