import { describe, expect, it } from "vitest";
import {
  advanceMastery,
  ARCS,
  atLeast,
  BUILD_TIERS,
  buildCoachingNote,
  canRunParallel,
  coachableSkills,
  isMasteryState,
  isSkillId,
  type MasteryMap,
  masteryOf,
  masteryRank,
  nextSkillToCoach,
  prerequisitesMet,
  reachableTier,
  sanitizeMastery,
  skillById,
  skillProgress,
  SKILLS,
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

describe("nextSkillToCoach", () => {
  it("returns null when nothing relevant is in play", () => {
    expect(nextSkillToCoach({}, [])).toBeNull();
  });

  it("coaches the lowest-order relevant skill that is not yet fluent", () => {
    expect(nextSkillToCoach({}, ["iterate-feedback", "ask-creation"])).toBe("ask-creation");
    expect(nextSkillToCoach({ "ask-creation": "fluent" }, ["iterate-feedback", "ask-creation"])).toBe(
      "iterate-feedback",
    );
  });

  it("skips a relevant skill whose prerequisites are not met", () => {
    // parallel-bots is relevant but the kid cannot direct one agent yet
    expect(nextSkillToCoach({}, ["parallel-bots"])).toBeNull();
    const ready: MasteryMap = { "ask-creation": "grasped", "iterate-feedback": "grasped" };
    expect(nextSkillToCoach(ready, ["parallel-bots"])).toBe("parallel-bots");
  });

  it("never re-coaches a fluent skill", () => {
    expect(nextSkillToCoach({ "ask-creation": "fluent" }, ["ask-creation"])).toBeNull();
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

describe("coachableSkills", () => {
  it("lists not-yet-fluent skills whose prereqs are met, lowest order first", () => {
    const ids = coachableSkills({ "ask-creation": "fluent" }).map((s) => s.id);
    expect(ids[0]).toBe("iterate-feedback");
    expect(ids).not.toContain("ask-creation"); // already fluent
    expect(ids).not.toContain("parallel-bots"); // prereqs not met
  });
});

describe("buildCoachingNote", () => {
  it("reports reach, the next skills, and asks Bit to record progress", () => {
    const note = buildCoachingNote({});
    expect(note).toContain("build tier 1 of 4");
    expect(note).toContain("ask-creation");
    expect(note).toContain("record_progress");
  });

  it("acknowledges a fully fluent builder", () => {
    const map = Object.fromEntries(SKILLS.map((s) => [s.id, "fluent" as const]));
    const note = buildCoachingNote(map);
    expect(note).toMatch(/fluent across the whole spine/i);
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
