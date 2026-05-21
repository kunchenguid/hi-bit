import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, type HiBitLayout } from "../storage/layout";
import { ProjectService } from "./projectService";

async function createService(): Promise<{ layout: HiBitLayout; service: ProjectService }> {
  const root = await mkdtemp(join(tmpdir(), "hibit-projects-"));
  const layout = await bootstrapLayout(root);
  let tick = 0;
  return {
    layout,
    service: new ProjectService(layout, () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5 + tick++))),
  };
}

describe("ProjectService", () => {
  let service: ProjectService;

  beforeEach(async () => {
    service = (await createService()).service;
  });

  it("creates project records, workbenches, factory dirs, and starter files", async () => {
    const project = await service.create({ title: "My maze" });
    const paths = service.pathsFor(project.id);

    expect(project).toMatchObject({
      schemaVersion: 1,
      factoryId: "default",
      title: "My maze",
    });
    expect(project.title).toBe("My maze");
    await expect(stat(paths.mainWorkbenchDir)).resolves.toBeTruthy();
    await expect(stat(paths.workbenchesDir)).resolves.toBeTruthy();
    await expect(stat(paths.bitSessionsDir)).resolves.toBeTruthy();
    await expect(stat(paths.botSessionsDir)).resolves.toBeTruthy();
    await expect(stat(paths.buildPlansDir)).resolves.toBeTruthy();
    await expect(stat(paths.botJobsDir)).resolves.toBeTruthy();
    await expect(stat(paths.machinesDir)).resolves.toBeTruthy();
    await expect(stat(paths.assemblyLineDir)).resolves.toBeTruthy();
    await expect(stat(paths.savePointsDir)).resolves.toBeTruthy();
    await expect(stat(paths.projectLogbookPath)).resolves.toBeTruthy();
    await expect(readFile(join(paths.mainWorkbenchDir, "index.html"), "utf8")).resolves.toContain(
      "My maze",
    );

    await expect(service.list()).resolves.toEqual([project]);
  });

  it("sorts projects by most recently updated", async () => {
    const first = await service.create({ title: "First" });
    const second = await service.create({ title: "Second" });
    const firstPaths = service.pathsFor(first.id);
    await service.setActiveBitSessionFile(
      first.id,
      join(firstPaths.bitSessionsDir, "session.jsonl"),
    );

    const projects = await service.list();
    expect(projects.map((project) => project.id)).toEqual([first.id, second.id]);
    expect(projects[0].activeSession).toEqual({
      provider: "pi",
      relativePath: "sessions/bit/session.jsonl",
    });

    await expect(service.get(first.id)).resolves.toMatchObject({
      activeBitSessionFile: join(firstPaths.bitSessionsDir, "session.jsonl"),
    });
  });

  it("rejects blank titles and unsafe project ids", async () => {
    await expect(service.create({ title: "   " })).rejects.toThrow(/project title/i);
    expect(() => service.pathsFor("../secret")).toThrow(/Invalid project id/);
  });
});
