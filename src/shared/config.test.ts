import { describe, expect, it } from "vitest";
import { HARNESS_IDS, REFERENCE_HARNESS } from "./config";

// The PRD "Open questions" list asked which harness ships first as the
// reference integration. REFERENCE_HARNESS is the landed answer; pinning
// its value here prevents silent drift and keeps the HarnessSetup's
// "Recommended" hint stable.
describe("REFERENCE_HARNESS", () => {
  it("is claude", () => {
    expect(REFERENCE_HARNESS).toBe("claude");
  });

  it("is a shipped harness id", () => {
    expect(HARNESS_IDS).toContain(REFERENCE_HARNESS);
  });
});
