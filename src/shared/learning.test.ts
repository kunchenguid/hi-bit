import { describe, expect, it } from "vitest";
import { buildLearningProgress } from "./learning";
import type { RoadmapItem } from "./profile";

const ROADMAP: RoadmapItem[] = [
  {
    id: "r1",
    title: "Minecraft world",
    status: "parked",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("buildLearningProgress", () => {
  it("summarizes a brand-new builder at tier 1 with no mastery", () => {
    const view = buildLearningProgress({}, []);
    expect(view.reachableTier).toBe(1);
    expect(view.tierLabel).toMatch(/ask/i);
    expect(view.skills).toHaveLength(13);
    expect(view.arcs).toHaveLength(4);
    expect(view.counts).toEqual({ fluent: 0, grasped: 0, total: 13 });
    expect(view.roadmap).toEqual([]);
  });

  it("reflects mastery, reach, and the roadmap for a growing builder", () => {
    const view = buildLearningProgress(
      {
        "ask-creation": "fluent",
        "iterate-feedback": "fluent",
        "specific-feedback": "fluent",
        "give-picture": "grasped",
      },
      ROADMAP,
    );
    expect(view.reachableTier).toBe(2);
    expect(view.counts).toMatchObject({ fluent: 3, grasped: 1 });
    expect(view.skills.find((skill) => skill.id === "ask-creation")?.mastery).toBe("fluent");
    expect(view.roadmap).toEqual(ROADMAP);
  });
});
