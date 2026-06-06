import { describe, expect, it } from "vitest";
import { planShorterEdgeResize } from "./captureImage";

describe("planShorterEdgeResize", () => {
  it("returns null when the shorter edge is already within the cap", () => {
    expect(planShorterEdgeResize({ width: 1280, height: 820 }, 1024)).toBeNull();
    expect(planShorterEdgeResize({ width: 1024, height: 4000 }, 1024)).toBeNull();
  });

  it("scales so the shorter edge hits the cap, preserving aspect ratio", () => {
    expect(planShorterEdgeResize({ width: 2560, height: 1640 }, 1024)).toEqual({
      width: 1598,
      height: 1024,
    });
  });
});
