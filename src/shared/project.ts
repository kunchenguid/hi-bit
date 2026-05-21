export type CreateProjectInput = {
  title: string;
};

export type ProjectSessionRef = {
  provider: "pi";
  relativePath: string;
};

export type ProjectSummary = {
  schemaVersion: 1;
  id: string;
  factoryId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeSession?: ProjectSessionRef;
};

export type ProjectRecord = ProjectSummary;
