import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import { describeKpSkip } from "./kpSkipState";

function makeProgress(overrides: Partial<Progress["knowledgePoints"][string]> = {}): Progress {
  return {
    ...emptyProgress(),
    knowledgePoints: {
      "css-colors": {
        status: "saw_it",
        firstSeenAt: "2026-04-23T00:00:00.000Z",
        updatedAt: "2026-04-23T00:00:00.000Z",
        ...overrides,
      },
    },
  };
}

describe("describeKpSkip", () => {
  it("treats null progress as not-skipped", () => {
    const result = describeKpSkip(null, "css-colors", "CSS colors");
    expect(result.skipped).toBe(false);
    expect(result.label).toBe("Skip");
    expect(result.nextSkipped).toBe(true);
    expect(result.ariaLabel).toContain("Skip CSS colors");
  });

  it("treats a missing KP entry as not-skipped", () => {
    const progress = emptyProgress();
    const result = describeKpSkip(progress, "css-colors", "CSS colors");
    expect(result.skipped).toBe(false);
    expect(result.label).toBe("Skip");
    expect(result.nextSkipped).toBe(true);
  });

  it("treats a KP entry without skipped flag as not-skipped", () => {
    const progress = makeProgress();
    const result = describeKpSkip(progress, "css-colors", "CSS colors");
    expect(result.skipped).toBe(false);
    expect(result.label).toBe("Skip");
    expect(result.nextSkipped).toBe(true);
  });

  it("treats skipped:false as not-skipped", () => {
    const progress = makeProgress({ skipped: false });
    const result = describeKpSkip(progress, "css-colors", "CSS colors");
    expect(result.skipped).toBe(false);
    expect(result.nextSkipped).toBe(true);
  });

  it("reports skipped:true as skipped with un-skip label", () => {
    const progress = makeProgress({ skipped: true });
    const result = describeKpSkip(progress, "css-colors", "CSS colors");
    expect(result.skipped).toBe(true);
    expect(result.label).toBe("Skipped");
    expect(result.nextSkipped).toBe(false);
    expect(result.ariaLabel).toContain("CSS colors is skipped");
    expect(result.ariaLabel).toContain("un-skip");
  });

  it("uses the provided kpTitle in the aria label", () => {
    const progress = makeProgress();
    const result = describeKpSkip(progress, "css-colors", "DOM event listeners");
    expect(result.ariaLabel).toContain("DOM event listeners");
  });
});
