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
  /**
   * The loopback port this creation's preview server binds to. Remembered so the
   * preview keeps the same `http://127.0.0.1:<port>/` origin across launches,
   * which is what lets a game's `localStorage` save survive replays and restarts
   * (storage is partitioned by origin, port included).
   */
  previewPort?: number;
};

export type ProjectRecord = ProjectSummary;
