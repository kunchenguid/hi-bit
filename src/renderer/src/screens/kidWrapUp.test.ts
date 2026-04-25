import { describe, expect, it } from "vitest";
import { buildKidWrapUpSummary } from "./kidWrapUp";

describe("buildKidWrapUpSummary", () => {
  it("includes the profile name in the title", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 0,
      doneSkillCount: 0,
    });
    expect(result.title).toBe("Great work today, Eddie!");
  });

  it("falls back to 'friend' for an empty profile name", () => {
    const result = buildKidWrapUpSummary({
      profileName: "",
      kidMessageCount: 0,
      doneSkillCount: 0,
    });
    expect(result.title).toBe("Great work today, friend!");
  });

  it("falls back to 'friend' when the profile name is whitespace", () => {
    const result = buildKidWrapUpSummary({
      profileName: "   ",
      kidMessageCount: 0,
      doneSkillCount: 0,
    });
    expect(result.title).toBe("Great work today, friend!");
  });

  it("returns a generic subtitle when nothing happened in the session", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 0,
      doneSkillCount: 0,
    });
    expect(result.subtitle).toBe("Your work is saved. Come back any time!");
  });

  it("singularises a single-message session", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 1,
      doneSkillCount: 0,
    });
    expect(result.subtitle).toBe("You chatted with Bit 1 time. Your work is saved.");
  });

  it("pluralises a multi-message session", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 4,
      doneSkillCount: 0,
    });
    expect(result.subtitle).toBe("You chatted with Bit 4 times. Your work is saved.");
  });

  it("singularises a single new skill", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 0,
      doneSkillCount: 1,
    });
    expect(result.subtitle).toBe("You learned 1 new skill. Your work is saved.");
  });

  it("pluralises multiple new skills", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 0,
      doneSkillCount: 3,
    });
    expect(result.subtitle).toBe("You learned 3 new skills. Your work is saved.");
  });

  it("combines messages and skills in one sentence", () => {
    const result = buildKidWrapUpSummary({
      profileName: "Eddie",
      kidMessageCount: 5,
      doneSkillCount: 2,
    });
    expect(result.subtitle).toBe(
      "You chatted with Bit 5 times and learned 2 new skills. Your work is saved.",
    );
  });
});
