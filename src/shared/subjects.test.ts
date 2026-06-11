import { describe, expect, it } from "vitest";
import {
  applySubjectSignals,
  buildSubjectsNote,
  type SubjectCurriculum,
  type SubjectSnapshot,
  sanitizeSubjectCurriculum,
  subjectProgressView,
} from "./subjects";

const MATH: SubjectCurriculum = {
  schemaVersion: 1,
  title: "Math",
  status: "active",
  skills: [
    { id: "count-up-score", label: "Count a game score up and down", mastery: "unseen" },
    {
      id: "add-two-digit",
      label: "Add two-digit numbers",
      parentLabel: "Addition within 100",
      mastery: "grasped",
    },
  ],
};

function snapshot(overrides: Partial<SubjectSnapshot> = {}): SubjectSnapshot {
  return {
    projectId: "project_math",
    creationTitle: "Math World",
    curriculum: MATH,
    goal: "Do the score math in my own games",
    recentLearningRecords: ["Knows single-digit addition"],
    ...overrides,
  };
}

describe("sanitizeSubjectCurriculum", () => {
  it("keeps a well-formed curriculum as-is", () => {
    expect(sanitizeSubjectCurriculum(MATH)).toEqual(MATH);
  });

  it("returns null for non-objects and curricula without a title", () => {
    expect(sanitizeSubjectCurriculum(null)).toBeNull();
    expect(sanitizeSubjectCurriculum("Math")).toBeNull();
    expect(sanitizeSubjectCurriculum([])).toBeNull();
    expect(sanitizeSubjectCurriculum({ status: "active", skills: [] })).toBeNull();
    expect(sanitizeSubjectCurriculum({ title: "   ", skills: [] })).toBeNull();
  });

  it("repairs unknown status and mastery, and skips malformed or duplicate skills", () => {
    const sanitized = sanitizeSubjectCurriculum({
      title: "Math",
      status: "weird",
      skills: [
        { id: "a", label: "A", mastery: "expert" },
        { id: "a", label: "A again", mastery: "grasped" },
        { id: "", label: "no id" },
        { label: "no id either" },
        "not even an object",
        { id: "b", label: "B", mastery: "fluent", parentLabel: "  Real B  " },
      ],
    });
    expect(sanitized).toEqual({
      schemaVersion: 1,
      title: "Math",
      status: "active",
      skills: [
        { id: "a", label: "A", mastery: "unseen" },
        { id: "b", label: "B", mastery: "fluent", parentLabel: "Real B" },
      ],
    });
  });

  it("tolerates a missing skills array", () => {
    expect(sanitizeSubjectCurriculum({ title: "Math" })).toEqual({
      schemaVersion: 1,
      title: "Math",
      status: "active",
      skills: [],
    });
  });
});

describe("applySubjectSignals", () => {
  it("advances mastery monotonically with the shared machine", () => {
    const first = applySubjectSignals(MATH, {
      "count-up-score": { demonstrated: true },
      "add-two-digit": { demonstrated: true, unprompted: true },
    });
    expect(first.changed).toBe(true);
    expect(first.recorded).toBe(2);
    expect(first.curriculum.skills.map((skill) => skill.mastery)).toEqual(["grasped", "fluent"]);

    // Mastery never regresses; re-recording a weaker signal changes nothing.
    const second = applySubjectSignals(first.curriculum, {
      "add-two-digit": { demonstrated: true },
    });
    expect(second.changed).toBe(false);
    expect(second.curriculum.skills[1]?.mastery).toBe("fluent");
  });

  it("never jumps straight to fluent on a first unprompted demonstration", () => {
    const { curriculum } = applySubjectSignals(MATH, {
      "count-up-score": { demonstrated: true, unprompted: true },
    });
    expect(curriculum.skills[0]?.mastery).toBe("grasped");
  });

  it("ignores unknown skill ids", () => {
    const result = applySubjectSignals(MATH, { "not-a-skill": { demonstrated: true } });
    expect(result.changed).toBe(false);
    expect(result.recorded).toBe(0);
    expect(result.curriculum).toBe(MATH);
  });
});

describe("subjectProgressView", () => {
  it("stamps the snapshot into a view with mastery counts", () => {
    const view = subjectProgressView(
      snapshot({
        curriculum: {
          ...MATH,
          skills: [
            { id: "a", label: "A", mastery: "fluent" },
            { id: "b", label: "B", mastery: "grasped" },
            { id: "c", label: "C", mastery: "unseen" },
          ],
        },
      }),
    );
    expect(view).toMatchObject({
      projectId: "project_math",
      title: "Math",
      creationTitle: "Math World",
      status: "active",
      goal: "Do the score math in my own games",
      counts: { fluent: 1, grasped: 1, total: 3 },
    });
  });
});

describe("buildSubjectsNote", () => {
  it("returns null when there is nothing to teach", () => {
    expect(buildSubjectsNote([])).toBeNull();
    expect(buildSubjectsNote([snapshot({ curriculum: { ...MATH, status: "done" } })])).toBeNull();
  });

  it("surfaces an active subject's goal, skill ids with mastery, and records", () => {
    const note = buildSubjectsNote([snapshot()]);
    expect(note).toContain('Subject "Math" [creation id: project_math] (active)');
    expect(note).toContain("Goal: Do the score math in my own games");
    expect(note).toContain("[unseen] count-up-score: Count a game score up and down");
    expect(note).toContain("[grasped] add-two-digit: Add two-digit numbers");
    expect(note).toContain("Knows single-digit addition");
    // The guardrails Bit must keep: evidence-only recording, subject-scoped
    // record_progress, and the shared one-new-idea pacing rule.
    expect(note).toMatch(/demonstrates understanding/i);
    expect(note).toContain("record_progress");
    expect(note).toMatch(/one-new-idea-per-message/i);
  });

  it("asks for the goal interview and the research build when files are missing", () => {
    const note = buildSubjectsNote([snapshot({ goal: null, curriculum: { ...MATH, skills: [] } })]);
    expect(note).toContain("learning/goal.md");
    expect(note).toContain("learning/curriculum.json");
  });

  it("keeps paused subjects to one line", () => {
    const note = buildSubjectsNote([
      snapshot({ curriculum: { ...MATH, status: "paused" } }),
    ]) as string;
    expect(note).toContain("paused");
    expect(note).not.toContain("Skills:");
  });
});
