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
  profileId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeSession?: ProjectSessionRef;
  /**
   * The last command Bit used to preview this creation, so Play can restart the
   * server after the in-memory preview process is gone (e.g. after an app quit).
   */
  lastPreviewCommand?: string;
};

export type ProjectRecord = ProjectSummary;
