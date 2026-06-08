import { describe, expect, it } from "vitest";
import {
  allowedWords,
  buildVocabularyNote,
  type ConceptId,
  eligibleConceptIds,
  nextConceptToUnlock,
  type UnlockFacts,
} from "./concepts";

const FRESH: UnlockFacts = { buildsDelegated: 0, creationCount: 0, openedActivities: false };

describe("eligibleConceptIds", () => {
  it("unlocks nothing for a brand-new kid", () => {
    expect(eligibleConceptIds(FRESH)).toEqual([]);
  });

  it("unlocks bot after the first build", () => {
    expect(eligibleConceptIds({ ...FRESH, buildsDelegated: 1 })).toEqual(["bot"]);
  });

  it("unlocks factory once the kid has a second creation", () => {
    expect(eligibleConceptIds({ ...FRESH, buildsDelegated: 1, creationCount: 2 })).toEqual([
      "bot",
      "factory",
    ]);
  });

  it("unlocks logbook once the kid has opened the activities view", () => {
    expect(eligibleConceptIds({ ...FRESH, openedActivities: true })).toContain("logbook");
  });

  it("only ever reveals the three early canon words - deeper words are taught, not revealed", () => {
    const ids = eligibleConceptIds({
      buildsDelegated: 99,
      creationCount: 99,
      openedActivities: true,
    });
    expect(ids).toEqual(["bot", "factory", "logbook"]);
  });
});

describe("nextConceptToUnlock", () => {
  it("returns null when nothing new is due", () => {
    expect(nextConceptToUnlock(FRESH, [])).toBeNull();
  });

  it("reveals at most one new word per turn, lowest tier first", () => {
    const facts: UnlockFacts = { buildsDelegated: 3, creationCount: 2, openedActivities: true };
    // bot, factory, logbook are all eligible at once, but only one may surface
    // this turn.
    expect(nextConceptToUnlock(facts, [])).toBe("bot");
    expect(nextConceptToUnlock(facts, ["bot"])).toBe("factory");
    expect(nextConceptToUnlock(facts, ["bot", "factory"])).toBe("logbook");
    expect(nextConceptToUnlock(facts, ["bot", "factory", "logbook"])).toBeNull();
  });

  it("returns null once every eligible concept is unlocked", () => {
    const facts: UnlockFacts = { buildsDelegated: 1, creationCount: 1, openedActivities: false };
    expect(nextConceptToUnlock(facts, ["bot"])).toBeNull();
  });
});

describe("allowedWords", () => {
  it("starts with only the base words", () => {
    expect(allowedWords([])).toEqual(["Bit", "build", "creation", "Play"]);
  });

  it("adds unlocked concept words in ladder order", () => {
    const unlocked: ConceptId[] = ["factory", "bot"];
    expect(allowedWords(unlocked)).toEqual(["Bit", "build", "creation", "Play", "bot", "factory"]);
  });
});

describe("buildVocabularyNote", () => {
  it("lists allowed words and omits a reveal line when nothing is new", () => {
    const note = buildVocabularyNote([], null);
    expect(note).toContain("Words you may use: Bit, build, creation, Play.");
    expect(note).not.toMatch(/newly unlocked/i);
  });

  it("adds a warm one-line reveal for a newly unlocked word", () => {
    const note = buildVocabularyNote(["bot"], "bot");
    expect(note).toContain("bot");
    expect(note).toMatch(/newly unlocked/i);
    expect(note).toMatch(/once this message/i);
  });
});
