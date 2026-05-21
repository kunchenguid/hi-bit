import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RuntimeProject } from "../projects/projectService";
import type { BotJobRecord } from "./botJobService";
import type { BotBuild, BotWorkbench } from "./botPipeline";

const execFileAsync = promisify(execFile);

export class WorkbenchService {
  async prepareBotWorkbench(
    project: RuntimeProject,
    job: Pick<BotJobRecord, "id">,
  ): Promise<BotWorkbench> {
    await this.ensureMainWorkbenchRepo(project);

    const path = join(project.workbenchesDir, job.id);
    const branchName = `bot/${job.id}`;
    await rm(path, { recursive: true, force: true });
    await mkdir(project.workbenchesDir, { recursive: true });
    await git(project.mainWorkbenchDir, ["worktree", "add", "-b", branchName, path, "HEAD"]);

    return {
      kind: "git-worktree",
      jobId: job.id,
      path,
      branchName,
    };
  }

  async installBotBuild(
    project: RuntimeProject,
    job: Pick<BotJobRecord, "id">,
    workbench: BotWorkbench,
    now: Date = new Date(),
  ): Promise<BotBuild> {
    await this.commitWorkbenchChanges(workbench.path, `Install bot job ${job.id}`);
    await git(project.mainWorkbenchDir, ["merge", "--ff-only", workbench.branchName]);
    await git(project.mainWorkbenchDir, ["worktree", "remove", "--force", workbench.path]);
    await git(project.mainWorkbenchDir, ["branch", "-D", workbench.branchName]).catch(() => {});
    return {
      jobId: job.id,
      status: "installed",
      installedAt: now.toISOString(),
    };
  }

  private async ensureMainWorkbenchRepo(project: RuntimeProject): Promise<void> {
    await mkdir(project.mainWorkbenchDir, { recursive: true });
    const hasGit = await exists(join(project.mainWorkbenchDir, ".git"));
    if (!hasGit) {
      await git(project.mainWorkbenchDir, ["init"]);
      await git(project.mainWorkbenchDir, ["checkout", "-B", "main"]);
    }

    await git(project.mainWorkbenchDir, ["config", "user.name", "Hi-Bit Factory"]);
    await git(project.mainWorkbenchDir, ["config", "user.email", "factory@hi-bit.local"]);
    await git(project.mainWorkbenchDir, ["add", "-A"]);
    const hasHead = await gitSucceeds(project.mainWorkbenchDir, ["rev-parse", "--verify", "HEAD"]);
    if (!hasHead || (await hasStagedChanges(project.mainWorkbenchDir))) {
      await git(project.mainWorkbenchDir, ["commit", "--allow-empty", "-m", "Create project"]);
    }
  }

  private async commitWorkbenchChanges(workbenchDir: string, message: string): Promise<void> {
    await git(workbenchDir, ["add", "-A"]);
    if (await hasStagedChanges(workbenchDir)) {
      await git(workbenchDir, ["commit", "-m", message]);
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

async function gitSucceeds(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

async function hasStagedChanges(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ["diff", "--cached", "--quiet"]);
    return false;
  } catch {
    return true;
  }
}
