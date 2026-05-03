import { describe, expect, it } from "vitest";
import { AGENT_IDS, REFERENCE_AGENT } from "./config";

// The PRD "Open questions" list asked which agent ships first as the
// reference integration. REFERENCE_AGENT is the landed answer; pinning
// its value here prevents silent drift and keeps the setup screen's
// "Recommended" hint stable.
describe("REFERENCE_AGENT", () => {
  it("is claude", () => {
    expect(REFERENCE_AGENT).toBe("claude");
  });

  it("is a shipped agent id", () => {
    expect(AGENT_IDS).toContain(REFERENCE_AGENT);
  });
});
