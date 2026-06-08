import { describe, expect, it } from "vitest";
import {
  ARCS,
  advanceMastery,
  atLeast,
  BUILD_TIERS,
  buildCoachingNote,
  canRunParallel,
  isMasteryState,
  isSkillId,
  type MasteryMap,
  masteryOf,
  masteryRank,
  prerequisitesMet,
  reachableTier,
  SKILLS,
  sanitizeMastery,
  skillById,
  skillProgress,
} from "./curriculum";

describe("the spine shape", () => {
  it("has 13 skills across 4 arcs in a stable order", () => {
    expect(SKILLS).toHaveLength(13);
    expect(SKILLS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(ARCS.map((a) => a.id)).toEqual(["direct", "context", "orchestrate", "oversee"]);
  });

  it("references only real arcs and gives every skill both a kid label and a real-skill name", () => {
    const arcIds = new Set(ARCS.map((a) => a.id));
    for (const skill of SKILLS) {
      expect(arcIds.has(skill.arc)).toBe(true);
      expect(skill.kidLabel.length).toBeGreaterThan(0);
      expect(skill.realSkill.length).toBeGreaterThan(0);
    }
  });

  it("encodes exactly one hard prerequisite: parallel bots need directing one agent first", () => {
    const withReqs = SKILLS.filter((s) => s.requires.length > 0);
    expect(withReqs.map((s) => s.id)).toEqual(["parallel-bots"]);
    expect(skillById("parallel-bots").requires).toEqual(["ask-creation", "iterate-feedback"]);
  });

  it("looks up a skill by id and throws on an unknown id", () => {
    expect(skillById("decompose").arc).toBe("orchestrate");
    // @ts-expect-error - exercising the runtime guard
    expect(() => skillById("nope")).toThrow();
  });
});

describe("mastery ordering", () => {
  it("ranks the four states", () => {
    expect(masteryRank("unseen")).toBe(0);
    expect(masteryRank("met")).toBe(1);
    expect(masteryRank("grasped")).toBe(2);
    expect(masteryRank("fluent")).toBe(3);
  });

  it("treats an absent skill as unseen", () => {
    expect(masteryOf({}, "decompose")).toBe("unseen");
    expect(masteryOf({ decompose: "grasped" }, "decompose")).toBe("grasped");
  });

  it("compares against a minimum", () => {
    expect(atLeast("grasped", "met")).toBe(true);
    expect(atLeast("met", "grasped")).toBe(false);
    expect(atLeast("fluent", "fluent")).toBe(true);
  });
});

describe("advanceMastery", () => {
  it("moves unseen to met when the situation first arises", () => {
    expect(advanceMastery("unseen", { met: true })).toBe("met");
  });

  it("jumps to grasped the first time the kid does it, even from unseen", () => {
    expect(advanceMastery("unseen", { demonstrated: true })).toBe("grasped");
    expect(advanceMastery("met", { demonstrated: true })).toBe("grasped");
  });

  it("promotes grasped to fluent only on an unprompted demonstration", () => {
    expect(advanceMastery("grasped", { demonstrated: true, unprompted: true })).toBe("fluent");
    expect(advanceMastery("grasped", { demonstrated: true, unprompted: false })).toBe("grasped");
  });

  it("does not skip grasped: a first-ever unprompted try lands at grasped, not fluent", () => {
    expect(advanceMastery("unseen", { demonstrated: true, unprompted: true })).toBe("grasped");
    expect(advanceMastery("met", { demonstrated: true, unprompted: true })).toBe("grasped");
  });

  it("never regresses", () => {
    expect(advanceMastery("fluent", {})).toBe("fluent");
    expect(advanceMastery("fluent", { met: true })).toBe("fluent");
    expect(advanceMastery("grasped", { met: true })).toBe("grasped");
    expect(advanceMastery("met", {})).toBe("met");
  });
});

describe("prerequisites (minimal DAG)", () => {
  it("lets a kid learn any free skill from the start", () => {
    expect(prerequisitesMet({}, "ask-creation")).toBe(true);
    expect(prerequisitesMet({}, "voice-input")).toBe(true);
    expect(prerequisitesMet({}, "decompose")).toBe(true);
  });

  it("gates parallel bots behind grasping how to direct one agent", () => {
    expect(canRunParallel({})).toBe(false);
    expect(canRunParallel({ "ask-creation": "grasped" })).toBe(false);
    expect(canRunParallel({ "ask-creation": "grasped", "iterate-feedback": "grasped" })).toBe(true);
    expect(canRunParallel({ "ask-creation": "fluent", "iterate-feedback": "fluent" })).toBe(true);
  });
});

describe("reachableTier", () => {
  it("floors at tier 1 for a brand-new kid", () => {
    expect(reachableTier({})).toBe(1);
    expect(BUILD_TIERS).toHaveLength(4);
  });

  it("climbs only when every cumulative tier requirement is fluent", () => {
    const direct: MasteryMap = {
      "ask-creation": "fluent",
      "iterate-feedback": "fluent",
      "specific-feedback": "fluent",
    };
    expect(reachableTier(direct)).toBe(2);

    const plusT3: MasteryMap = {
      ...direct,
      decompose: "fluent",
      "async-productive": "fluent",
    };
    expect(reachableTier(plusT3)).toBe(3);

    const plusT4: MasteryMap = {
      ...plusT3,
      "dependency-reasoning": "fluent",
      "parallel-bots": "fluent",
    };
    expect(reachableTier(plusT4)).toBe(4);
  });

  it("does not skip a tier when a lower requirement is only grasped", () => {
    const map: MasteryMap = {
      "ask-creation": "grasped",
      "iterate-feedback": "fluent",
      "specific-feedback": "fluent",
    };
    expect(reachableTier(map)).toBe(1);
  });
});

describe("sanitization helpers", () => {
  it("recognizes real skill ids and mastery states", () => {
    expect(isSkillId("decompose")).toBe(true);
    expect(isSkillId("blueprint")).toBe(false);
    expect(isMasteryState("fluent")).toBe(true);
    expect(isMasteryState("expert")).toBe(false);
    expect(isMasteryState(3)).toBe(false);
  });

  it("drops unknown skills and invalid states from a stored mastery map", () => {
    const raw = {
      decompose: "grasped",
      "ask-creation": "fluent",
      blueprint: "fluent", // retired skill id
      "show-screen": "wizard", // invalid state
    };
    expect(sanitizeMastery(raw)).toEqual({ decompose: "grasped", "ask-creation": "fluent" });
    expect(sanitizeMastery(null)).toEqual({});
    expect(sanitizeMastery("nope")).toEqual({});
  });
});

describe("buildCoachingNote", () => {
  it("surfaces the whole map and hands the teaching decision to Bit", () => {
    const note = buildCoachingNote({ "ask-creation": "grasped", "give-picture": "met" });
    // The framing: Bit decides, at most one, never forced - not a prescribed skill.
    expect(note).toMatch(/learning map/i);
    expect(note).toMatch(/you decide/i);
    expect(note).toMatch(/at most one new idea/i);
    expect(note).not.toMatch(/skills to grow next|guide them forward/i);
    // Reach and record_progress are present.
    expect(note).toContain("build tier 1 of 4");
    expect(note).toContain("record_progress");
  });

  it("lists every skill grouped by arc (by engineering name), with the builder's mastery", () => {
    const note = buildCoachingNote({ "ask-creation": "grasped" });
    for (const arc of ARCS) expect(note).toContain(`${arc.title}:`);
    for (const skill of SKILLS) expect(note).toContain(skill.realSkill);
    expect(note).toContain("[grasped] Kicking off work / stating intent");
    expect(note).toContain("[unseen] Decomposition");
    // The internal map never leaks the gated kid inside-words.
    expect(note).not.toMatch(/\bbot\b/i);
    expect(note).not.toMatch(/\bfactory\b|\blogbook\b/i);
  });

  it("offers an example only for skills not yet mastered, never for fluent ones", () => {
    const askNudge = skillById("ask-creation").nudge ?? "###";
    expect(buildCoachingNote({})).toContain(askNudge); // unseen -> example shown
    const note = buildCoachingNote({ "ask-creation": "fluent" });
    expect(note).toContain("[fluent] Kicking off work / stating intent");
    expect(note).not.toContain(askNudge); // fluent -> no "to introduce" example
  });

  it("states the parallel-readiness guardrail derived from mastery", () => {
    expect(buildCoachingNote({})).toMatch(/Parallel building is not open yet/i);
    expect(buildCoachingNote({})).toContain("park_ambition");
    const ready = buildCoachingNote({ "ask-creation": "grasped", "iterate-feedback": "grasped" });
    expect(ready).toMatch(/Parallel building is open/i);
    expect(ready).not.toMatch(/not open yet/i);
  });
});

describe("skillProgress", () => {
  it("returns every skill with its current mastery, defaulting to unseen", () => {
    const progress = skillProgress({ decompose: "grasped" });
    expect(progress).toHaveLength(13);
    expect(progress.find((p) => p.id === "decompose")?.mastery).toBe("grasped");
    expect(progress.find((p) => p.id === "ask-creation")?.mastery).toBe("unseen");
  });
});
