import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubjectCurriculum } from "@shared/subjects";
import { describe, expect, it } from "vitest";
import {
  applySubjectSkillSignals,
  learningPathsFor,
  listSubjectSnapshots,
  readSubjectSnapshot,
} from "./subjectFiles";

const MATH: SubjectCurriculum = {
  schemaVersion: 1,
  title: "Math",
  status: "active",
  skills: [
    { id: "count-up-score", label: "Count a game score up and down", mastery: "unseen" },
    { id: "add-two-digit", label: "Add two-digit numbers", mastery: "grasped" },
  ],
};

async function makeWorkbench(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-subject-"));
}

async function seedSubject(
  mainWorkbenchDir: string,
  curriculum: unknown = MATH,
  options: { goal?: string; records?: Record<string, string> } = {},
): Promise<void> {
  const paths = learningPathsFor(mainWorkbenchDir);
  await mkdir(paths.learningDir, { recursive: true });
  await writeFile(paths.curriculumPath, JSON.stringify(curriculum, null, 2), "utf8");
  if (options.goal !== undefined) {
    await writeFile(paths.goalPath, options.goal, "utf8");
  }
  if (options.records) {
    await mkdir(paths.recordsDir, { recursive: true });
    for (const [name, content] of Object.entries(options.records)) {
      await writeFile(join(paths.recordsDir, name), content, "utf8");
    }
  }
}

describe("readSubjectSnapshot", () => {
  it("returns null for an ordinary creation with no learning folder", async () => {
    const dir = await makeWorkbench();
    expect(await readSubjectSnapshot({ id: "p1", title: "Cat Game", mainWorkbenchDir: dir })).toBe(
      null,
    );
  });

  it("returns null when curriculum.json is malformed instead of throwing", async () => {
    const dir = await makeWorkbench();
    const paths = learningPathsFor(dir);
    await mkdir(paths.learningDir, { recursive: true });
    await writeFile(paths.curriculumPath, "{ not json", "utf8");
    expect(
      await readSubjectSnapshot({ id: "p1", title: "Math World", mainWorkbenchDir: dir }),
    ).toBeNull();
  });

  it("reads the curriculum, goal, and newest learning-record titles", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir, MATH, {
      goal: "# Goal\nDo score math in my own games\n",
      records: {
        "0001-knows-counting.md": "# Knows counting to 100\n\nShowed it while playing.\n",
        "0002-single-digit-addition.md": "Single-digit addition is solid\n",
      },
    });
    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });
    expect(snapshot).toMatchObject({
      projectId: "p1",
      creationTitle: "Math World",
      goal: "# Goal\nDo score math in my own games",
    });
    expect(snapshot?.curriculum).toEqual(MATH);
    // Newest first, heading marker stripped.
    expect(snapshot?.recentLearningRecords).toEqual([
      "Single-digit addition is solid",
      "Knows counting to 100",
    ]);
  });

  it("sanitizes a curriculum a model wrote loosely", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir, {
      title: "Math",
      status: "nope",
      skills: [{ id: "a", label: "A", mastery: "wat" }, { label: "no id" }],
    });
    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });
    expect(snapshot?.curriculum).toEqual({
      schemaVersion: 1,
      title: "Math",
      status: "active",
      skills: [{ id: "a", label: "A", mastery: "unseen" }],
    });
  });

  it("detects built lesson pages by skill slug and exposes the next unbuilt lesson", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir, {
      ...MATH,
      skills: [
        ...MATH.skills,
        { id: "subtract-spending", label: "Subtract coins after buying", mastery: "unseen" },
      ],
    });
    await mkdir(join(dir, "lessons"), { recursive: true });
    await writeFile(join(dir, "lessons", "0001-count-up-score.html"), "one", "utf8");
    await writeFile(join(dir, "lessons", "0002-add-two-digit.html"), "two", "utf8");

    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });

    expect(snapshot?.lessonState).toEqual({
      builtSkillIds: ["count-up-score", "add-two-digit"],
      newestBuiltSkillId: "add-two-digit",
      newestBuiltLessonNumber: 2,
      nextUnbuiltSkillId: "subtract-spending",
    });
  });

  it("falls back to lesson numbers and keeps one-ahead state on the contiguous path", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir, {
      ...MATH,
      skills: [
        ...MATH.skills,
        { id: "subtract-spending", label: "Subtract coins after buying", mastery: "unseen" },
      ],
    });
    await mkdir(join(dir, "lessons"), { recursive: true });
    await writeFile(join(dir, "lessons", "0001.html"), "one", "utf8");
    await writeFile(join(dir, "lessons", "0003-subtract-spending.html"), "three", "utf8");

    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });

    expect(snapshot?.lessonState).toEqual({
      builtSkillIds: ["count-up-score", "subtract-spending"],
      newestBuiltSkillId: "count-up-score",
      newestBuiltLessonNumber: 1,
      nextUnbuiltSkillId: "add-two-digit",
    });
  });

  it("uses the numeric lesson prefix before overlapping skill slugs", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir, {
      ...MATH,
      skills: [
        { id: "add", label: "Add numbers", mastery: "unseen" },
        { id: "add-two-digit", label: "Add two-digit numbers", mastery: "unseen" },
        { id: "subtract-spending", label: "Subtract coins after buying", mastery: "unseen" },
      ],
    });
    await mkdir(join(dir, "lessons"), { recursive: true });
    await writeFile(join(dir, "lessons", "0001-add.html"), "one", "utf8");
    await writeFile(join(dir, "lessons", "0002-add-two-digit.html"), "two", "utf8");

    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });

    expect(snapshot?.lessonState).toEqual({
      builtSkillIds: ["add", "add-two-digit"],
      newestBuiltSkillId: "add-two-digit",
      newestBuiltLessonNumber: 2,
      nextUnbuiltSkillId: "subtract-spending",
    });
  });

  it("prefers the longest slug match when filenames have no lesson number", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir, {
      ...MATH,
      skills: [
        { id: "add", label: "Add numbers", mastery: "unseen" },
        { id: "add-two-digit", label: "Add two-digit numbers", mastery: "unseen" },
      ],
    });
    await mkdir(join(dir, "lessons"), { recursive: true });
    await writeFile(join(dir, "lessons", "add.html"), "one", "utf8");
    await writeFile(join(dir, "lessons", "practice-add-two-digit.html"), "two", "utf8");

    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });

    expect(snapshot?.lessonState).toEqual({
      builtSkillIds: ["add", "add-two-digit"],
      newestBuiltSkillId: "add-two-digit",
      newestBuiltLessonNumber: 2,
      nextUnbuiltSkillId: null,
    });
  });

  it("omits lesson state when lesson files are missing or unusable", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir);
    await mkdir(join(dir, "lessons"), { recursive: true });
    await writeFile(join(dir, "lessons", "notes.txt"), "not a page", "utf8");

    const snapshot = await readSubjectSnapshot({
      id: "p1",
      title: "Math World",
      mainWorkbenchDir: dir,
    });

    expect(snapshot?.lessonState).toBeUndefined();
  });
});

describe("listSubjectSnapshots", () => {
  it("keeps only the learning creations", async () => {
    const math = await makeWorkbench();
    const game = await makeWorkbench();
    await seedSubject(math);
    const snapshots = await listSubjectSnapshots([
      { id: "math", title: "Math World", mainWorkbenchDir: math },
      { id: "game", title: "Cat Game", mainWorkbenchDir: game },
    ]);
    expect(snapshots.map((snapshot) => snapshot.projectId)).toEqual(["math"]);
  });
});

describe("applySubjectSkillSignals", () => {
  it("advances mastery monotonically and persists to curriculum.json", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir);

    const first = await applySubjectSkillSignals(dir, {
      "count-up-score": { demonstrated: true },
      "add-two-digit": { demonstrated: true, unprompted: true },
    });
    expect(first.recorded).toBe(2);
    expect(first.curriculum.skills.map((skill) => skill.mastery)).toEqual(["grasped", "fluent"]);

    const onDisk = JSON.parse(
      await readFile(learningPathsFor(dir).curriculumPath, "utf8"),
    ) as SubjectCurriculum;
    expect(onDisk.skills.map((skill) => skill.mastery)).toEqual(["grasped", "fluent"]);

    // A weaker later signal never regresses the persisted state.
    const second = await applySubjectSkillSignals(dir, {
      "add-two-digit": { demonstrated: true },
    });
    expect(second.curriculum.skills[1]?.mastery).toBe("fluent");
  });

  it("ignores unknown skill ids but reports how many matched", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir);
    const result = await applySubjectSkillSignals(dir, {
      "not-a-skill": { demonstrated: true },
    });
    expect(result.recorded).toBe(0);
  });

  it("throws plainly when the creation has no curriculum", async () => {
    const dir = await makeWorkbench();
    await expect(
      applySubjectSkillSignals(dir, { "count-up-score": { demonstrated: true } }),
    ).rejects.toThrow(/no learning curriculum/i);
  });

  it("serializes concurrent advances so neither write is lost", async () => {
    const dir = await makeWorkbench();
    await seedSubject(dir);
    await Promise.all([
      applySubjectSkillSignals(dir, { "count-up-score": { demonstrated: true } }),
      applySubjectSkillSignals(dir, { "add-two-digit": { demonstrated: true, unprompted: true } }),
    ]);
    const onDisk = JSON.parse(
      await readFile(learningPathsFor(dir).curriculumPath, "utf8"),
    ) as SubjectCurriculum;
    expect(onDisk.skills.map((skill) => skill.mastery)).toEqual(["grasped", "fluent"]);
  });
});
