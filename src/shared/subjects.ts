import { advanceMastery, isMasteryState, type MasteryState, type SkillSignal } from "./curriculum";

/**
 * Subjects: the "teach me Math" side of Hi-Bit's teaching system.
 *
 * A subject is not a new record type - it is a **learning creation**: an
 * ordinary creation whose `main-workbench/learning/` folder exists. Everything
 * about the subject lives in plain files inside that creation (versioned by
 * save-points along with the lessons, inspectable by a parent on disk):
 *
 *   learning/goal.md               - WHY the builder wants to learn this
 *   learning/curriculum.json       - the skill map + mastery (this module's shape)
 *   learning/learning-records/*.md - ADR-style insights, append-only
 *   learning/resources.md          - trusted sources the research bot found
 *   learning/notes.md              - how this builder likes to be taught
 *
 * Bit and the bots read and write these files with their existing file tools
 * (the schemas are taught by the `teach-subject` and `create-lesson` skills).
 * The one guarded exception is the `mastery` field: it is advanced only through
 * the `record_progress` tool (with `subject`), so the no-regression invariant
 * stays deterministic instead of resting on prompt discipline. It reuses the
 * exact mastery machine from `curriculum.ts` (unseen -> grasped -> fluent,
 * monotonic).
 *
 * This module is pure data + pure functions, consumed by the main process (to
 * read/advance the files and build Bit's per-turn subject note) and by the
 * renderer (the Factory Handbook and the grown-up progress window).
 */

/** Where a subject's files live, relative to the creation's main-workbench. */
export const LEARNING_DIR = "learning";
export const CURRICULUM_FILENAME = "curriculum.json";
export const GOAL_FILENAME = "goal.md";
export const LEARNING_RECORDS_DIR = "learning-records";

export type SubjectStatus = "active" | "paused" | "done";

export type SubjectSkill = {
  /** Stable slug the model passes to record_progress (e.g. "count-up-score"). */
  id: string;
  /** Kid-facing label, in plain kid words (shown in the Factory Handbook). */
  label: string;
  /** Grown-up phrasing for the parent window. Defaults to `label`. */
  parentLabel?: string;
  /** Same monotonic gradient as the builder-skills curriculum. */
  mastery: MasteryState;
  addedAt?: string;
};

/** Code-computed state for the lesson pages that already exist in a subject creation. */
export type SubjectLessonState = {
  /** Curriculum skill ids with lesson pages detected on disk, in curriculum order. */
  builtSkillIds: string[];
  /** The newest contiguous built lesson in curriculum order, null when lesson one is missing. */
  newestBuiltSkillId: string | null;
  /** One-based lesson number for `newestBuiltSkillId`, null when there is none. */
  newestBuiltLessonNumber: number | null;
  /** The next curriculum skill whose lesson should be built after the newest built one. */
  nextUnbuiltSkillId: string | null;
};

/** The shape of `learning/curriculum.json`. */
export type SubjectCurriculum = {
  schemaVersion: 1;
  /** The subject's name (e.g. "Math"), distinct from the creation's title. */
  title: string;
  status: SubjectStatus;
  skills: SubjectSkill[];
};

/**
 * One subject as the main process reads it off disk: the curriculum plus the
 * goal and the most recent learning-record titles, stamped with the creation
 * that holds it.
 */
export type SubjectSnapshot = {
  projectId: string;
  /** The creation's title (e.g. "Math World"). */
  creationTitle: string;
  curriculum: SubjectCurriculum;
  /** Contents of learning/goal.md, trimmed; null when not written yet. */
  goal: string | null;
  /** Titles of the most recent learning records, newest first. */
  recentLearningRecords: string[];
  /** Lesson pages detected on disk. Missing when there are no usable lesson files. */
  lessonState?: SubjectLessonState;
};

/** A subject in the read-only progress view (both reflection surfaces). */
export type SubjectProgressView = {
  projectId: string;
  title: string;
  creationTitle: string;
  status: SubjectStatus;
  goal: string | null;
  skills: SubjectSkill[];
  counts: { fluent: number; grasped: number; total: number };
};

const SUBJECT_STATUSES: ReadonlySet<SubjectStatus> = new Set(["active", "paused", "done"]);

export function isSubjectStatus(value: unknown): value is SubjectStatus {
  return typeof value === "string" && SUBJECT_STATUSES.has(value as SubjectStatus);
}

/**
 * Keeps only a well-formed curriculum - used when loading `curriculum.json`
 * from disk, where the file was written by a model with its file tools and may
 * be malformed or hand-edited. Returns null when the value is not a curriculum
 * at all (missing/blank title or no object), so a broken file degrades to "not
 * a subject" instead of crashing a turn. Within a valid curriculum, invalid
 * skills are skipped and an unknown status/mastery is repaired, mirroring
 * `sanitizeMastery` for the profile.
 */
export function sanitizeSubjectCurriculum(value: unknown): SubjectCurriculum | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) return null;
  const status = isSubjectStatus(record.status) ? record.status : "active";
  const skills: SubjectSkill[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(record.skills) ? record.skills : []) {
    if (!raw || typeof raw !== "object") continue;
    const skill = raw as Record<string, unknown>;
    const id = typeof skill.id === "string" ? skill.id.trim() : "";
    const label = typeof skill.label === "string" ? skill.label.trim() : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const sanitized: SubjectSkill = {
      id,
      label,
      mastery: isMasteryState(skill.mastery) ? skill.mastery : "unseen",
    };
    if (typeof skill.parentLabel === "string" && skill.parentLabel.trim()) {
      sanitized.parentLabel = skill.parentLabel.trim();
    }
    if (typeof skill.addedAt === "string") sanitized.addedAt = skill.addedAt;
    skills.push(sanitized);
  }
  return { schemaVersion: 1, title, status, skills };
}

/**
 * Applies Bit's mastery judgments to a subject curriculum, monotonically (the
 * same `advanceMastery` machine as the builder-skills ledger). Unknown skill
 * ids are ignored; `recorded` counts the signals that matched a skill.
 */
export function applySubjectSignals(
  curriculum: SubjectCurriculum,
  signals: Record<string, SkillSignal>,
): { curriculum: SubjectCurriculum; changed: boolean; recorded: number } {
  let changed = false;
  let recorded = 0;
  const skills = curriculum.skills.map((skill) => {
    const signal = signals[skill.id];
    if (!signal) return skill;
    recorded += 1;
    const after = advanceMastery(skill.mastery, signal);
    if (after === skill.mastery) return skill;
    changed = true;
    return { ...skill, mastery: after };
  });
  return { curriculum: changed ? { ...curriculum, skills } : curriculum, changed, recorded };
}

export function subjectProgressView(snapshot: SubjectSnapshot): SubjectProgressView {
  const { skills } = snapshot.curriculum;
  return {
    projectId: snapshot.projectId,
    title: snapshot.curriculum.title,
    creationTitle: snapshot.creationTitle,
    status: snapshot.curriculum.status,
    goal: snapshot.goal,
    skills,
    counts: {
      fluent: skills.filter((skill) => skill.mastery === "fluent").length,
      grasped: skills.filter((skill) => skill.mastery === "grasped").length,
      total: skills.length,
    },
  };
}

/** Keeps the goal from flooding the per-turn note when a model wrote a long one. */
const NOTE_GOAL_MAX_CHARS = 600;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The per-turn subject note appended to Bit's prompt when the builder has
 * learning creations - the same trick as the coaching note: surface the whole
 * map (goal, skills with mastery, recent learning records) and let Bit judge
 * whether this turn is a teaching turn at all. Returns null when there is
 * nothing to say (no active or paused subjects), so quiet profiles pay no
 * prompt tokens for the feature.
 */
export function buildSubjectsNote(snapshots: SubjectSnapshot[]): string | null {
  const active = snapshots.filter((snapshot) => snapshot.curriculum.status === "active");
  const paused = snapshots.filter((snapshot) => snapshot.curriculum.status === "paused");
  if (active.length === 0 && paused.length === 0) return null;
  const lines = [
    "Learning subjects - subjects the builder asked you to teach, each living inside its own learning creation (the teach-subject skill holds the full way of teaching). For each: the goal, the skill map, and recent learning records. Pick what to teach next from the first skills not yet fluent that the records say the builder is ready for - challenged just enough, never re-teaching what a record says they know. Lessons live in that creation, built like any build. Record progress ONLY when the builder demonstrates understanding (answers, explains back, uses it) - playing a lesson is not yet learning; call record_progress with subject set to that creation's id, using the skill ids below. The one-new-idea-per-message rule covers these subjects and the builder skills combined.",
  ];
  for (const snapshot of active) {
    lines.push(
      `Subject "${snapshot.curriculum.title}" [creation id: ${snapshot.projectId}] (active):`,
    );
    lines.push(
      `  Goal: ${snapshot.goal ? clip(snapshot.goal, NOTE_GOAL_MAX_CHARS) : "not written yet - ask why they want to learn this, then write learning/goal.md"}`,
    );
    if (snapshot.curriculum.skills.length > 0) {
      lines.push("  Skills:");
      for (const skill of snapshot.curriculum.skills) {
        lines.push(`    - [${skill.mastery}] ${skill.id}: ${skill.label}`);
      }
    } else {
      lines.push("  Skills: none yet - a research build should write learning/curriculum.json.");
    }
    appendLessonStateLines(lines, snapshot);
    if (snapshot.recentLearningRecords.length > 0) {
      lines.push("  Recent learning records:");
      for (const title of snapshot.recentLearningRecords) {
        lines.push(`    - ${title}`);
      }
    }
  }
  for (const snapshot of paused) {
    lines.push(
      `Subject "${snapshot.curriculum.title}" [creation id: ${snapshot.projectId}] is paused - leave it unless the builder asks to pick it back up.`,
    );
  }
  return lines.join("\n");
}

function appendLessonStateLines(lines: string[], snapshot: SubjectSnapshot): void {
  const state = snapshot.lessonState;
  if (!state?.newestBuiltSkillId || !state.nextUnbuiltSkillId) return;
  const newest = snapshot.curriculum.skills.find((skill) => skill.id === state.newestBuiltSkillId);
  const next = snapshot.curriculum.skills.find((skill) => skill.id === state.nextUnbuiltSkillId);
  if (!newest || !next) return;
  lines.push("  Lesson build state:");
  lines.push(
    `    Built lesson skills: ${state.builtSkillIds.length > 0 ? state.builtSkillIds.join(", ") : "none detected"}`,
  );
  lines.push(
    `    Newest built lesson: ${newest.id} (lesson ${state.newestBuiltLessonNumber}): ${newest.label}`,
  );
  lines.push(`    Next unbuilt lesson: ${next.id}: ${next.label}`);
  lines.push(
    "    One-ahead chat trigger: if this turn shows the builder reached, played, or finished the newest built lesson, call delegate_build exactly once now for the next unbuilt lesson. In the build instructions, name that skill, include what the learning records say, and say this is a lesson job that must not edit learning/curriculum.json. If the builder has not reached the newest built lesson, do not delegate just because a next lesson exists. You may re-read teach-subject for the full doctrine.",
  );
}
