import { describe, expect, it, vi } from "vitest";
import { assertAcpAgentLauncherAvailable, resolveAcpAgentLauncher } from "./acpxAgentAvailability";

describe("resolveAcpAgentLauncher", () => {
  it("can describe ACPX's registered launcher without requiring it on PATH", () => {
    expect(resolveAcpAgentLauncher("claude").commandLine).toContain("claude");
  });
});

describe("assertAcpAgentLauncherAvailable", () => {
  it("accepts a supported ACP agent without probing launcher commands", async () => {
    const access = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });

    await expect(
      assertAcpAgentLauncherAvailable("claude", {
        pathValue: "/usr/bin",
        access,
        platform: "darwin",
      }),
    ).resolves.toBeUndefined();
    expect(access).not.toHaveBeenCalled();
  });
});
