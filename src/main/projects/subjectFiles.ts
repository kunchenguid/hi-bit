import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { SkillSignal } from "@shared/curriculum";
import {
  applySubjectSignals,
  CURRICULUM_FILENAME,
  GOAL_FILENAME,
  LEARNING_DIR,
  LEARNING_RECORDS_DIR,
  type SubjectCurriculum,
  type SubjectLessonState,
  type SubjectSnapshot,
  sanitizeSubjectCurriculum,
} from "@shared/subjects";
import { readJsonFile, writeJsonFile } from "../storage/json";

/**
 * Reads and advances a learning creation's `learning/` files (see
 * `shared/subjects.ts` for the layout). A creation IS a subject exactly when
 * `main-workbench/learning/curriculum.json` parses to a valid curriculum -
 * file-presence detection, no project-record flag. Bit and the bots write
 * these files with their ordinary file tools; this module is the main
 * process's defensive read side plus the one guarded write: advancing mastery
 * through `record_progress`.
 */

export type SubjectProjectRef = {
  id: string;
  title: string;
  mainWorkbenchDir: string;
};

/** How many learning-record titles ride in Bit's per-turn subject note. */
const RECENT_RECORDS_LIMIT = 5;
const LESSONS_DIR = "lessons";
const LESSON_PAGE_EXTENSIONS = new Set([".html", ".htm"]);

export function learningPathsFor(mainWorkbenchDir: string): {
  learningDir: string;
  curriculumPath: string;
  goalPath: string;
  recordsDir: string;
} {
  const learningDir = join(mainWorkbenchDir, LEARNING_DIR);
  return {
    learningDir,
    curriculumPath: join(learningDir, CURRICULUM_FILENAME),
    goalPath: join(learningDir, GOAL_FILENAME),
    recordsDir: join(learningDir, LEARNING_RECORDS_DIR),
  };
}

/**
 * Reads one creation's subject snapshot, or null when the creation is not a
 * learning creation (no curriculum file, or a file too broken to sanitize).
 * Every read is defensive: a malformed file a model wrote degrades to less
 * context, never to a thrown turn.
 */
export async function readSubjectSnapshot(
  project: SubjectProjectRef,
): Promise<SubjectSnapshot | null> {
  const paths = learningPathsFor(project.mainWorkbenchDir);
  const curriculum = sanitizeSubjectCurriculum(
    await readJsonFile<unknown>(paths.curriculumPath).catch(() => null),
  );
  if (!curriculum) return null;
  const lessonState = await readLessonState(project.mainWorkbenchDir, curriculum);
  return {
    projectId: project.id,
    creationTitle: project.title,
    curriculum,
    goal: await readGoal(paths.goalPath),
    recentLearningRecords: await readRecentRecordTitles(paths.recordsDir),
    ...(lessonState ? { lessonState } : {}),
  };
}

/** Snapshots for every learning creation in a portfolio, in portfolio order. */
export async function listSubjectSnapshots(
  projects: SubjectProjectRef[],
): Promise<SubjectSnapshot[]> {
  const snapshots = await Promise.all(projects.map((project) => readSubjectSnapshot(project)));
  return snapshots.filter((snapshot): snapshot is SubjectSnapshot => snapshot !== null);
}

/**
 * Serializes curriculum writes per file so two mastery advances in one turn
 * cannot interleave a read-modify-write (the same guard ProfileService keeps
 * for profile.json).
 */
const curriculumWrites = new Map<string, Promise<unknown>>();

/**
 * Advances a subject's mastery from Bit's `record_progress` signals -
 * monotonic, file-backed, the only sanctioned writer of the `mastery` field.
 * Throws when the creation has no readable curriculum, so the tool can tell
 * Bit plainly instead of silently dropping the record.
 */
export async function applySubjectSkillSignals(
  mainWorkbenchDir: string,
  signals: Record<string, SkillSignal>,
): Promise<{ curriculum: SubjectCurriculum; recorded: number }> {
  const { curriculumPath } = learningPathsFor(mainWorkbenchDir);
  const previous = curriculumWrites.get(curriculumPath) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const curriculum = sanitizeSubjectCurriculum(
        await readJsonFile<unknown>(curriculumPath).catch(() => null),
      );
      if (!curriculum) {
        throw new Error("That creation has no learning curriculum yet (learning/curriculum.json).");
      }
      const result = applySubjectSignals(curriculum, signals);
      if (result.changed) {
        await writeJsonFile(curriculumPath, result.curriculum);
      }
      return { curriculum: result.curriculum, recorded: result.recorded };
    });
  curriculumWrites.set(curriculumPath, next);
  try {
    return await next;
  } finally {
    if (curriculumWrites.get(curriculumPath) === next) {
      curriculumWrites.delete(curriculumPath);
    }
  }
}

async function readGoal(goalPath: string): Promise<string | null> {
  try {
    const goal = (await readFile(goalPath, "utf8")).trim();
    return goal ? goal : null;
  } catch {
    return null;
  }
}

async function readLessonState(
  mainWorkbenchDir: string,
  curriculum: SubjectCurriculum,
): Promise<SubjectLessonState | undefined> {
  if (curriculum.skills.length === 0) return undefined;
  let names: string[];
  try {
    const entries = await readdir(join(mainWorkbenchDir, LESSONS_DIR), { withFileTypes: true });
    names = entries
      .filter(
        (entry) => entry.isFile() && LESSON_PAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()),
      )
      .map((entry) => entry.name);
  } catch {
    return undefined;
  }
  const builtIndexes = new Set<number>();
  const skillSlugs = curriculum.skills.map((skill) => normalizeLessonSlug(skill.id));
  for (const name of names) {
    const slug = normalizeLessonSlug(name.replace(/\.[^.]+$/, ""));
    const skillIndex = skillSlugs.findIndex((skillSlug) => slugContainsSkill(slug, skillSlug));
    if (skillIndex >= 0) {
      builtIndexes.add(skillIndex);
      continue;
    }
    const lessonNumber = lessonNumberFromSlug(slug);
    if (!lessonNumber) continue;
    const index = lessonNumber - 1;
    if (index >= 0 && index < curriculum.skills.length) builtIndexes.add(index);
  }
  if (builtIndexes.size === 0) return undefined;
  const orderedBuiltIndexes = [...builtIndexes].sort((a, b) => a - b);
  let newestContiguousIndex = -1;
  while (builtIndexes.has(newestContiguousIndex + 1)) newestContiguousIndex += 1;
  const newestBuiltSkill =
    newestContiguousIndex >= 0 ? curriculum.skills[newestContiguousIndex] : undefined;
  const nextIndex = newestContiguousIndex + 1;
  const nextUnbuiltSkill =
    newestBuiltSkill && nextIndex < curriculum.skills.length
      ? curriculum.skills[nextIndex]
      : undefined;
  return {
    builtSkillIds: orderedBuiltIndexes
      .map((index) => curriculum.skills[index]?.id)
      .filter((id): id is string => typeof id === "string"),
    newestBuiltSkillId: newestBuiltSkill?.id ?? null,
    newestBuiltLessonNumber: newestBuiltSkill ? newestContiguousIndex + 1 : null,
    nextUnbuiltSkillId: nextUnbuiltSkill?.id ?? null,
  };
}

function normalizeLessonSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugContainsSkill(slug: string, skillSlug: string): boolean {
  if (!skillSlug) return false;
  return (
    slug === skillSlug ||
    slug.startsWith(`${skillSlug}-`) ||
    slug.endsWith(`-${skillSlug}`) ||
    slug.includes(`-${skillSlug}-`)
  );
}

function lessonNumberFromSlug(slug: string): number | null {
  const direct = slug.match(/^0*(\d+)(?:-|$)/);
  const named = slug.match(/^lesson-0*(\d+)(?:-|$)/);
  const raw = direct?.[1] ?? named?.[1];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The newest learning-record titles, newest first. Records are numbered
 * `0001-slug.md`, so filename order is chronological; the title is the first
 * heading (or first non-empty line) of each file.
 */
async function readRecentRecordTitles(recordsDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = (await readdir(recordsDir)).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const recent = names.slice(-RECENT_RECORDS_LIMIT).reverse();
  const titles: string[] = [];
  for (const name of recent) {
    try {
      const raw = await readFile(join(recordsDir, name), "utf8");
      const firstLine = raw
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean);
      if (firstLine) titles.push(firstLine.replace(/^#+\s*/, ""));
    } catch {}
  }
  return titles;
}
