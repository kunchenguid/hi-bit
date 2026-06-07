import { describe, expect, it } from "vitest";

describe("electron-vite config", () => {
  it("injects the build-time Umami telemetry config into the main bundle", async () => {
    const { default: config } = await import("./electron.vite.config");

    expect(config.main?.define).toHaveProperty("process.env.HIBIT_BUILD_UMAMI_HOST");
    expect(config.main?.define).toHaveProperty("process.env.HIBIT_BUILD_UMAMI_WEBSITE_ID");
  });
});
