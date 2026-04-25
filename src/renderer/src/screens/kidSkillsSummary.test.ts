import { describe, expect, it } from "vitest";
import { describeKidSkillsSummary } from "./kidSkillsSummary";
import type { MasterySummary } from "./parent/masterySummary";

function summary(partial: Partial<MasterySummary>): MasterySummary {
  return {
    areas: [],
    total: 0,
    mastered: 0,
    inProgress: 0,
    notStarted: 0,
    skipped: 0,
    ...partial,
  };
}

describe("describeKidSkillsSummary", () => {
  it("returns null when nothing started yet", () => {
    expect(describeKidSkillsSummary(summary({ total: 10, notStarted: 10 }))).toBeNull();
  });

  it("returns null when only skipped KPs exist", () => {
    expect(describeKidSkillsSummary(summary({ total: 5, notStarted: 4, skipped: 1 }))).toBeNull();
  });

  it("reports mastered count alone when no in-progress", () => {
    const out = describeKidSkillsSummary(summary({ mastered: 3, notStarted: 7, total: 10 }));
    expect(out).toEqual({ kicker: "skills", text: "3 learned" });
  });

  it("includes in-progress count when mastered has both mastered and in-progress", () => {
    const out = describeKidSkillsSummary(
      summary({ mastered: 2, inProgress: 1, notStarted: 7, total: 10 }),
    );
    expect(out).toEqual({ kicker: "skills", text: "2 learned - 1 in progress" });
  });

  it("reports in-progress only when nothing mastered yet", () => {
    const out = describeKidSkillsSummary(
      summary({ mastered: 0, inProgress: 2, notStarted: 8, total: 10 }),
    );
    expect(out).toEqual({ kicker: "skills", text: "2 in progress" });
  });

  it("singular counts are rendered with the count prefix only (no 's' suffix logic)", () => {
    const out = describeKidSkillsSummary(summary({ mastered: 1, notStarted: 9, total: 10 }));
    expect(out?.text).toBe("1 learned");
  });

  it("ignores skipped KPs in the visible counts", () => {
    const out = describeKidSkillsSummary(
      summary({ mastered: 1, inProgress: 0, notStarted: 0, skipped: 5, total: 6 }),
    );
    expect(out).toEqual({ kicker: "skills", text: "1 learned" });
  });

  it("handles large counts without overflow", () => {
    const out = describeKidSkillsSummary(
      summary({ mastered: 42, inProgress: 13, notStarted: 45, total: 100 }),
    );
    expect(out).toEqual({ kicker: "skills", text: "42 learned - 13 in progress" });
  });
});
