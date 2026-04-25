export type KnowledgePointStatus = "saw_it" | "did_with_help" | "did_unprompted" | "explained_it";

export type KnowledgePointProgress = {
  status: KnowledgePointStatus;
  evidence?: string;
  firstSeenAt: string;
  updatedAt: string;
  skipped?: boolean;
};

export type ProjectEntry = {
  dreamId: string;
  slug: string;
  startedAt: string;
  lastActiveAt: string;
};

export type SessionLogEntry = {
  id: string;
  startedAt: string;
  endedAt?: string;
  summary?: string;
};

export type Progress = {
  version: number;
  knowledgePoints: Record<string, KnowledgePointProgress>;
  projects: ProjectEntry[];
  sessions: SessionLogEntry[];
  dreamHistory: string[];
};

export const PROGRESS_VERSION = 1;

export function emptyProgress(): Progress {
  return {
    version: PROGRESS_VERSION,
    knowledgePoints: {},
    projects: [],
    sessions: [],
    dreamHistory: [],
  };
}
