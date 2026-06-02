import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ProfileService } from "../profiles/profileService";
import { bootstrapLayout, type HiBitLayout } from "../storage/layout";
import { ProjectService } from "./projectService";

async function createService(): Promise<{
  layout: HiBitLayout;
  profiles: ProfileService;
  service: ProjectService;
}> {
  const root = await mkdtemp(join(tmpdir(), "hibit-projects-"));
  const layout = await bootstrapLayout(root);
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5 + tick++));
  return {
    layout,
    profiles: new ProfileService(layout, now),
    service: new ProjectService(layout, now),
  };
}

describe("ProjectService", () => {
  let profiles: ProfileService;
  let service: ProjectService;
  let adaId: string;
  let samId: string;

  beforeEach(async () => {
    const setup = await createService();
    profiles = setup.profiles;
    service = setup.service;
    adaId = (await profiles.create({ name: "Ada", age: 9 })).id;
    samId = (await profiles.create({ name: "Sam", age: 10 })).id;
  });

  it("creates project records, workbenches, profile dirs, and starter files", async () => {
    const project = await service.create(adaId, { title: "My maze" });
    const paths = service.pathsFor(adaId, project.id);

    expect(project).toMatchObject({
      schemaVersion: 1,
      profileId: adaId,
      title: "My maze",
    });
    expect(project).not.toHaveProperty("factoryId");
    expect(project.title).toBe("My maze");
    await expect(stat(paths.mainWorkbenchDir)).resolves.toBeTruthy();
    await expect(stat(paths.workbenchesDir)).resolves.toBeTruthy();
    await expect(stat(paths.bitSessionsDir)).resolves.toBeTruthy();
    await expect(stat(paths.botSessionsDir)).resolves.toBeTruthy();
    await expect(stat(paths.blueprintsDir)).resolves.toBeTruthy();
    await expect(stat(paths.botJobsDir)).resolves.toBeTruthy();
    await expect(stat(paths.machinesDir)).resolves.toBeTruthy();
    await expect(stat(paths.assemblyLineDir)).resolves.toBeTruthy();
    await expect(stat(paths.savePointsDir)).resolves.toBeTruthy();
    await expect(stat(paths.projectLogbookPath)).resolves.toBeTruthy();
    await expect(readFile(join(paths.mainWorkbenchDir, "index.html"), "utf8")).resolves.toContain(
      "My maze",
    );

    await expect(service.list(adaId)).resolves.toEqual([project]);
  });

  it("keeps project lists separate for each kid profile", async () => {
    const adaProject = await service.create(adaId, { title: "Ada maze" });
    const samProject = await service.create(samId, { title: "Sam site" });

    await expect(service.list(adaId)).resolves.toEqual([adaProject]);
    await expect(service.list(samId)).resolves.toEqual([samProject]);
    await expect(service.get(adaId, samProject.id)).rejects.toThrow(/Project not found/);
  });

  it("sorts projects by most recently updated", async () => {
    const first = await service.create(adaId, { title: "First" });
    const second = await service.create(adaId, { title: "Second" });
    const firstPaths = service.pathsFor(adaId, first.id);
    await service.setActiveBitSessionFile(
      adaId,
      first.id,
      join(firstPaths.bitSessionsDir, "session.jsonl"),
    );

    const projects = await service.list(adaId);
    expect(projects.map((project) => project.id)).toEqual([first.id, second.id]);
    expect(projects[0].activeSession).toEqual({
      provider: "pi",
      relativePath: "sessions/bit/session.jsonl",
    });

    await expect(service.get(adaId, first.id)).resolves.toMatchObject({
      activeBitSessionFile: join(firstPaths.bitSessionsDir, "session.jsonl"),
    });
  });

  it("remembers a creation's preview command and keeps it across a touch", async () => {
    const command = 'python3 -m http.server "$PORT" --bind 127.0.0.1';
    const project = await service.create(adaId, { title: "Snake Game" });

    await service.rememberPreviewCommand(adaId, project.id, command);
    await expect(service.get(adaId, project.id)).resolves.toMatchObject({
      lastPreviewCommand: command,
    });

    // A later build completion touches the record; the command must survive.
    await service.touch(adaId, project.id);
    await expect(service.get(adaId, project.id)).resolves.toMatchObject({
      lastPreviewCommand: command,
    });
    const listed = await service.list(adaId);
    expect(listed.find((p) => p.id === project.id)?.lastPreviewCommand).toBe(command);
  });

  it("reports preview history from the logbook, even without a remembered command", async () => {
    const project = await service.create(adaId, { title: "Snake Game" });
    await expect(service.hasPreviewHistory(adaId, project.id)).resolves.toBe(false);

    // A preview was recorded on an older build that never stored the command.
    await service.recordPreviewServer(adaId, project.id, {
      projectId: project.id,
      title: "Snake Game",
      url: "http://127.0.0.1:51913/",
      startedAt: "2026-05-27T23:46:15.722Z",
    });

    await expect(service.hasPreviewHistory(adaId, project.id)).resolves.toBe(true);
    // ...but the command was never persisted on that old data.
    expect((await service.get(adaId, project.id)).lastPreviewCommand).toBeUndefined();
  });

  it("rejects blank titles and unsafe project ids", async () => {
    await expect(service.create(adaId, { title: "   " })).rejects.toThrow(/project title/i);
    expect(() => service.pathsFor("../secret", "project-1")).toThrow(/Invalid profile id/);
    expect(() => service.pathsFor(adaId, "../secret")).toThrow(/Invalid project id/);
  });

  it("reads persisted tool steps from the logbook, reduced by callId", async () => {
    const project = await service.create(adaId, { title: "Cat Jump" });
    await service.appendActivity(adaId, project.id, {
      type: "tool_step",
      callId: "c1",
      toolName: "write",
      status: "running",
      args: { path: "index.html" },
    });
    await service.appendActivity(adaId, project.id, {
      type: "tool_step",
      callId: "c1",
      status: "completed",
      content: [{ type: "text", text: "wrote it" }],
    });
    await service.appendActivity(adaId, project.id, {
      type: "tool_step",
      callId: "c2",
      toolName: "read",
      status: "running",
    });

    await expect(service.readActivity(adaId, project.id)).resolves.toEqual([
      {
        callId: "c1",
        toolName: "write",
        status: "completed",
        args: { path: "index.html" },
        content: [{ type: "text", text: "wrote it" }],
      },
      {
        callId: "c2",
        toolName: "read",
        status: "running",
        args: undefined,
        content: [],
      },
    ]);
  });

  it("ignores non-tool logbook rows when reading activity", async () => {
    const project = await service.create(adaId, { title: "Cat Jump" });
    // create() already wrote a project_created row; readActivity must skip it.
    await expect(service.readActivity(adaId, project.id)).resolves.toEqual([]);
  });
});
