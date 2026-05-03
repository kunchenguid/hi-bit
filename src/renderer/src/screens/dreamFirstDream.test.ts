import type { Dream, DreamDifficulty } from "@shared/dreams";
import type { Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import {
  describeGreatFirstDream,
  isFirstDreamPicker,
  pickGreatFirstDreamIds,
} from "./dreamFirstDream";

function makeDream(id: string, requiresCount: number, difficulty: DreamDifficulty = 1): Dream {
  return {
    id,
    title_parent: id,
    title_kid: id,
    summary_kid: "",
    categories: ["personal"],
    interest_tags: [],
    requires: Array.from({ length: requiresCount }, (_, i) => `kp-${id}-${i}`),
    style_hints: [],
    emoji: "✨",
    difficulty,
  };
}

function emptyProgress(): Progress {
  return {
    version: 1,
    knowledgePoints: {},
    projects: [],
    sessions: [],
    dreamHistory: [],
  };
}

describe("isFirstDreamPicker", () => {
  it("returns true when progress is null", () => {
    expect(isFirstDreamPicker(null)).toBe(true);
  });

  it("returns true when progress has no projects, history, or learned KPs", () => {
    expect(isFirstDreamPicker(emptyProgress())).toBe(true);
  });

  it("returns false when the kid has any saved project", () => {
    const p = emptyProgress();
    p.projects.push({
      dreamId: "click-me",
      slug: "click-me",
      startedAt: "2026-01-01T00:00:00Z",
      lastActiveAt: "2026-01-01T00:00:00Z",
    });
    expect(isFirstDreamPicker(p)).toBe(false);
  });

  it("returns false when the kid has any dream history", () => {
    const p = emptyProgress();
    p.dreamHistory.push("click-me");
    expect(isFirstDreamPicker(p)).toBe(false);
  });

  it("returns false when the kid has learned any KP", () => {
    const p = emptyProgress();
    p.knowledgePoints["html-doc-shell"] = {
      status: "saw_it",
      firstSeenAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(isFirstDreamPicker(p)).toBe(false);
  });
});

describe("pickGreatFirstDreamIds", () => {
  it("returns an empty set when there are no dreams", () => {
    expect(pickGreatFirstDreamIds([])).toEqual(new Set<string>());
  });

  it("picks the three dreams with the fewest required skills", () => {
    const dreams: Dream[] = [
      makeDream("hard", 12),
      makeDream("easy-a", 3),
      makeDream("medium", 7),
      makeDream("easy-b", 3),
      makeDream("easy-c", 4),
      makeDream("hardest", 21),
    ];
    expect(pickGreatFirstDreamIds(dreams)).toEqual(new Set(["easy-a", "easy-b", "easy-c"]));
  });

  it("prefers lower difficulty before alphabetical ids for first-time kids", () => {
    const dreams: Dream[] = [
      makeDream("emoji-button", 1, 3),
      makeDream("first-heading", 1, 3),
      makeDream("page-frame", 1, 3),
      makeDream("show-me-around", 1, 1),
      makeDream("tag-sandwich", 1, 2),
      makeDream("web-page-map", 1, 2),
    ];
    expect(pickGreatFirstDreamIds(dreams)).toEqual(
      new Set(["show-me-around", "tag-sandwich", "web-page-map"]),
    );
  });

  it("breaks ties by id (alphabetical) so the pick is deterministic", () => {
    const dreams: Dream[] = [
      makeDream("zebra", 4),
      makeDream("alpha", 4),
      makeDream("mango", 4),
      makeDream("beta", 4),
    ];
    expect(pickGreatFirstDreamIds(dreams)).toEqual(new Set(["alpha", "beta", "mango"]));
  });

  it("returns all dreams if fewer than three exist", () => {
    const dreams: Dream[] = [makeDream("only-one", 5), makeDream("only-two", 6)];
    expect(pickGreatFirstDreamIds(dreams)).toEqual(new Set(["only-one", "only-two"]));
  });

  it("does not consider dreams with zero required skills as great-first picks (no skills to learn)", () => {
    const dreams: Dream[] = [
      makeDream("empty", 0),
      makeDream("easy-a", 3),
      makeDream("easy-b", 4),
      makeDream("easy-c", 4),
    ];
    expect(pickGreatFirstDreamIds(dreams)).toEqual(new Set(["easy-a", "easy-b", "easy-c"]));
  });
});

describe("describeGreatFirstDream", () => {
  it("returns a sentence-case label so the chip does not read as ALL CAPS once styled", () => {
    const d = describeGreatFirstDream();
    expect(d.kicker).toBe("Great first dream");
    expect(d.text.length).toBeGreaterThan(0);
    expect(d.kicker).not.toBe(d.kicker.toUpperCase());
  });
});
