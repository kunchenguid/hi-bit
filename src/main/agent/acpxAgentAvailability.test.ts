import { describe, expect, it, vi } from "vitest";
import { assertAcpAgentLauncherAvailable, resolveAcpAgentLauncher } from "./acpxAgentAvailability";

describe("resolveAcpAgentLauncher", () => {
  it("shows that ACPX launches Claude through the npx adapter bridge", () => {
    expect(resolveAcpAgentLauncher("claude").command).toBe("npx");
  });
});

describe("assertAcpAgentLauncherAvailable", () => {
  it("rejects setup when the ACPX adapter launcher is not on PATH", async () => {
    const access = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });

    await expect(
      assertAcpAgentLauncherAvailable("claude", {
        pathValue: "/usr/bin",
        access,
        platform: "darwin",
      }),
    ).rejects.toThrow(/npx/);
  });
});
