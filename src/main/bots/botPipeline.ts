import type { RuntimeProject } from "../projects/projectService";
import type { BotJobRecord } from "./botJobService";
import { WorkbenchService } from "./workbenchService";

export type BotWorkbench = {
  kind: "git-worktree";
  jobId: string;
  path: string;
  branchName: string;
};

export type InspectionReport = {
  name: string;
  status: "passed" | "failed";
  message?: string;
};

export type BotBuild = {
  jobId: string;
  status: "installed" | "rejected";
  installedAt?: string;
  reason?: string;
};

export type BotPipeline = {
  prepareBotWorkbench(project: RuntimeProject, job: BotJobRecord): Promise<BotWorkbench>;
  runMachines(
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: BotWorkbench,
  ): Promise<InspectionReport[]>;
  installBotBuild(
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: BotWorkbench,
  ): Promise<BotBuild>;
};

export class LocalBotPipeline implements BotPipeline {
  constructor(
    private readonly workbenches = new WorkbenchService(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  prepareBotWorkbench(project: RuntimeProject, job: BotJobRecord): Promise<BotWorkbench> {
    return this.workbenches.prepareBotWorkbench(project, job);
  }

  async runMachines(): Promise<InspectionReport[]> {
    return [{ name: "workspace_machine", status: "passed" }];
  }

  installBotBuild(
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: BotWorkbench,
  ): Promise<BotBuild> {
    return this.workbenches.installBotBuild(project, job, workbench, this.now());
  }
}
