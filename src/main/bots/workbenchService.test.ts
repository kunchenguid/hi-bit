import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProfileService } from "../profiles/profileService";
import { ProjectService } from "../projects/projectService";
import { bootstrapLayout } from "../storage/layout";
import { WorkbenchService } from "./workbenchService";

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), "hibit-workbench-"));
  const layout = await bootstrapLayout(root);
  const profiles = new ProfileService(layout);
  const profile = await profiles.create({ name: "Ada", age: 9 });
  const projects = new ProjectService(layout);
  const summary = await projects.create(profile.id, { title: "Factory game" });
  return projects.get(profile.id, summary.id);
}

describe("WorkbenchService", () => {
  it("runs bot work in a git worktree and installs the build into the main workbench", async () => {
    const project = await createProject();
    const service = new WorkbenchService();

    const workbench = await service.prepareBotWorkbench(project, { id: "job_test" });

    expect(workbench.kind).toBe("git-worktree");
    expect(workbench.path).toBe(join(project.workbenchesDir, "job_test"));
    await expect(readFile(join(workbench.path, "index.html"), "utf8")).resolves.toContain(
      "Factory game",
    );

    await writeFile(join(workbench.path, "bot-note.txt"), "built by a bot\n", "utf8");
    const build = await service.installBotBuild(project, { id: "job_test" }, workbench);

    expect(build).toMatchObject({
      jobId: "job_test",
      status: "installed",
    });
    await expect(readFile(join(project.mainWorkbenchDir, "bot-note.txt"), "utf8")).resolves.toBe(
      "built by a bot\n",
    );
    await expect(stat(workbench.path)).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);
});
