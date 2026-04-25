import { describe, expect, it } from "vitest";
import type { DreamReadiness } from "./dreamReadiness";
import { describeDreamRequiresWarning } from "./dreamRequiresWarning";

function readiness(partial: Partial<DreamReadiness>): DreamReadiness {
  return {
    requiredCount: 0,
    readyCount: 0,
    unknownCount: 0,
    allReady: true,
    ...partial,
  };
}

describe("describeDreamRequiresWarning", () => {
  it("returns null when there are no unknown requires", () => {
    expect(describeDreamRequiresWarning(readiness({}))).toBeNull();
  });

  it("returns null for a fully-known dream with mixed readiness", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 3, readyCount: 2, unknownCount: 0, allReady: false }),
      ),
    ).toBeNull();
  });

  it("returns null when an all-ready dream has no unknowns", () => {
    expect(
      describeDreamRequiresWarning(readiness({ requiredCount: 2, readyCount: 2, allReady: true })),
    ).toBeNull();
  });

  it("reports singular noun for exactly one unknown require", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 3, readyCount: 1, unknownCount: 1, allReady: false }),
      ),
    ).toEqual({ kicker: "heads up", text: "1 missing skill in the graph" });
  });

  it("reports plural noun for multiple unknown requires", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 4, readyCount: 0, unknownCount: 3, allReady: false }),
      ),
    ).toEqual({ kicker: "heads up", text: "3 missing skills in the graph" });
  });

  it("reports plural for a dream where every require is unknown", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 2, readyCount: 0, unknownCount: 2, allReady: false }),
      ),
    ).toEqual({ kicker: "heads up", text: "2 missing skills in the graph" });
  });

  it("handles a single-require all-unknown dream as singular", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 1, readyCount: 0, unknownCount: 1, allReady: false }),
      ),
    ).toEqual({ kicker: "heads up", text: "1 missing skill in the graph" });
  });

  it("returns null for a zero-requires dream (nothing to warn about)", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 0, readyCount: 0, unknownCount: 0, allReady: true }),
      ),
    ).toBeNull();
  });

  it("reports large unknown counts without overflow", () => {
    expect(
      describeDreamRequiresWarning(
        readiness({ requiredCount: 25, readyCount: 5, unknownCount: 20, allReady: false }),
      ),
    ).toEqual({ kicker: "heads up", text: "20 missing skills in the graph" });
  });
});
