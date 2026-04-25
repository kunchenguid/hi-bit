import type { ProjectFileWatcher } from "./projects";

export type ProjectFileWatcherRegistry = {
  register: (watcher: ProjectFileWatcher) => number;
  close: (id: number) => boolean;
  closeAll: () => void;
  size: () => number;
  has: (id: number) => boolean;
};

export function createProjectWatcherRegistry(): ProjectFileWatcherRegistry {
  let nextId = 1;
  const watchers = new Map<number, ProjectFileWatcher>();

  return {
    register(watcher) {
      const id = nextId++;
      watchers.set(id, watcher);
      return id;
    },
    close(id) {
      const watcher = watchers.get(id);
      if (!watcher) return false;
      watcher.close();
      watchers.delete(id);
      return true;
    },
    closeAll() {
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
    size() {
      return watchers.size;
    },
    has(id) {
      return watchers.has(id);
    },
  };
}
