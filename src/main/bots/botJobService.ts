import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { ProjectSummary } from "@shared/project";
import type { RuntimeProject } from "../projects/projectService";
import { writeJsonFile } from "../storage/json";
import type { BotBuild, BotWorkbench, InspectionReport } from "./botPipeline";

export type BlueprintRecord = {
  schemaVersion: 1;
  id: string;
  factoryId: string;
  projectId: string;
  leadPrompt: string;
  projectCatalog: Array<{ id: string; title: string; updatedAt: string }>;
  status: "dispatched";
  createdAt: string;
};

export type BotJobRecord = {
  schemaVersion: 1;
  id: string;
  factoryId: string;
  projectId: string;
  blueprintId: string;
  status: "queued" | "running" | "completed" | "cancelled" | "jammed";
  createdAt: string;
  updatedAt: string;
  workbench?: BotWorkbench;
  inspections?: InspectionReport[];
  build?: BotBuild;
  error?: string;
};

type BotJobServiceOptions = {
  now?: () => Date;
  nextBlueprintId?: () => string;
  nextJobId?: () => string;
};

export class BotJobService {
  private readonly now: () => Date;
  private readonly nextBlueprintId: () => string;
  private readonly nextJobId: () => string;

  constructor(options: BotJobServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.nextBlueprintId = options.nextBlueprintId ?? (() => `blueprint_${randomId()}`);
    this.nextJobId = options.nextJobId ?? (() => `bot_job_${randomId()}`);
  }

  async createBlueprint(
    project: RuntimeProject,
    leadPrompt: string,
    projectCatalog: ProjectSummary[],
  ): Promise<BlueprintRecord> {
    const blueprint: BlueprintRecord = {
      schemaVersion: 1,
      id: this.nextBlueprintId(),
      factoryId: project.factoryId,
      projectId: project.id,
      leadPrompt,
      projectCatalog: projectCatalog.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt,
      })),
      status: "dispatched",
      createdAt: this.now().toISOString(),
    };
    await writeJsonFile(join(project.blueprintsDir, `${blueprint.id}.json`), blueprint);
    return blueprint;
  }

  async createJob(project: RuntimeProject, blueprint: BlueprintRecord): Promise<BotJobRecord> {
    const timestamp = this.now().toISOString();
    const job: BotJobRecord = {
      schemaVersion: 1,
      id: this.nextJobId(),
      factoryId: project.factoryId,
      projectId: project.id,
      blueprintId: blueprint.id,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.writeJob(project, job);
    return job;
  }

  async markRunning(
    project: RuntimeProject,
    job: BotJobRecord,
    workbench: BotWorkbench,
  ): Promise<BotJobRecord> {
    return this.writeJob(project, {
      ...job,
      status: "running",
      updatedAt: this.now().toISOString(),
      workbench,
    });
  }

  async complete(
    project: RuntimeProject,
    job: BotJobRecord,
    inspections: InspectionReport[],
    build: BotBuild,
  ): Promise<BotJobRecord> {
    return this.writeJob(project, {
      ...job,
      status: "completed",
      updatedAt: this.now().toISOString(),
      inspections,
      build,
    });
  }

  async cancel(project: RuntimeProject, job: BotJobRecord): Promise<BotJobRecord> {
    return this.writeJob(project, {
      ...job,
      status: "cancelled",
      updatedAt: this.now().toISOString(),
    });
  }

  async jam(project: RuntimeProject, job: BotJobRecord, error: string): Promise<BotJobRecord> {
    return this.writeJob(project, {
      ...job,
      status: "jammed",
      updatedAt: this.now().toISOString(),
      error,
    });
  }

  private async writeJob(project: RuntimeProject, job: BotJobRecord): Promise<BotJobRecord> {
    await writeJsonFile(join(project.botJobsDir, `${job.id}.json`), job);
    return job;
  }
}

function randomId(): string {
  return randomUUID().replace(/-/g, "");
}
