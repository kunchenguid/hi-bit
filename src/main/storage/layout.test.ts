import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultHiBitConfig } from "@shared/config";
import { describe, expect, it } from "vitest";
import { assertSafeId, bootstrapLayout, projectDir } from "./layout";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-layout-"));
}

describe("bootstrapLayout", () => {
  it("creates the robot-factory local-first app layout", async () => {
    const root = await tempRoot();
    const layout = await bootstrapLayout(root, () => new Date("2026-01-02T03:04:05.000Z"));

    await expect(stat(layout.authDir)).resolves.toBeTruthy();
    await expect(stat(layout.piAgentDir)).resolves.toBeTruthy();
    await expect(stat(layout.defaultFactoryDir)).resolves.toBeTruthy();
    await expect(stat(layout.defaultFactoryLogbookDir)).resolves.toBeTruthy();
    await expect(stat(projectDir(layout, "sample"))).rejects.toMatchObject({ code: "ENOENT" });

    const home = JSON.parse(await readFile(layout.homePath, "utf8"));
    expect(home).toEqual({
      schemaVersion: 1,
      defaultFactoryId: "default",
    });

    const config = JSON.parse(await readFile(layout.configPath, "utf8"));
    expect(config).toEqual(defaultHiBitConfig());

    const factory = JSON.parse(
      await readFile(join(layout.defaultFactoryDir, "factory.json"), "utf8"),
    );
    expect(factory).toEqual({
      schemaVersion: 1,
      id: "default",
      name: "Builder's Factory",
      createdAt: "2026-01-02T03:04:05.000Z",
    });

    const lead = JSON.parse(await readFile(join(layout.defaultFactoryDir, "lead.json"), "utf8"));
    expect(lead).toEqual({
      schemaVersion: 1,
      id: "lead",
      name: "Builder",
      role: "lead_builder",
      createdAt: "2026-01-02T03:04:05.000Z",
    });
  });
});

describe("assertSafeId", () => {
  it("rejects path traversal ids", () => {
    expect(assertSafeId("abc_123-DEF")).toBe("abc_123-DEF");
    expect(() => assertSafeId("../secret", "project id")).toThrow(/Invalid project id/);
    expect(() => assertSafeId("with/slash", "project id")).toThrow(/Invalid project id/);
  });
});
