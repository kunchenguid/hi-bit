import { describe, expect, it, vi } from "vitest";
import type { ProjectFileWatcher } from "./projects";
import { createProjectWatcherRegistry } from "./projectWatchRegistry";

function fakeWatcher(): ProjectFileWatcher & { close: ReturnType<typeof vi.fn<() => void>> } {
  return { close: vi.fn<() => void>() };
}

describe("createProjectWatcherRegistry", () => {
  it("starts empty and hands out monotonically increasing ids", () => {
    const registry = createProjectWatcherRegistry();
    expect(registry.size()).toBe(0);
    const id1 = registry.register(fakeWatcher());
    const id2 = registry.register(fakeWatcher());
    const id3 = registry.register(fakeWatcher());
    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id3).toBe(3);
    expect(registry.size()).toBe(3);
  });

  it("has(id) reports membership before and after close", () => {
    const registry = createProjectWatcherRegistry();
    const id = registry.register(fakeWatcher());
    expect(registry.has(id)).toBe(true);
    expect(registry.has(999)).toBe(false);
    registry.close(id);
    expect(registry.has(id)).toBe(false);
  });

  it("close(id) calls watcher.close() and removes the entry", () => {
    const registry = createProjectWatcherRegistry();
    const watcher = fakeWatcher();
    const id = registry.register(watcher);
    expect(registry.close(id)).toBe(true);
    expect(watcher.close).toHaveBeenCalledTimes(1);
    expect(registry.size()).toBe(0);
  });

  it("close(id) returns false for an unknown id without throwing", () => {
    const registry = createProjectWatcherRegistry();
    expect(registry.close(42)).toBe(false);
  });

  it("close(id) is idempotent: a second close is a no-op", () => {
    const registry = createProjectWatcherRegistry();
    const watcher = fakeWatcher();
    const id = registry.register(watcher);
    expect(registry.close(id)).toBe(true);
    expect(registry.close(id)).toBe(false);
    expect(watcher.close).toHaveBeenCalledTimes(1);
  });

  it("closeAll() closes every registered watcher and empties the registry", () => {
    const registry = createProjectWatcherRegistry();
    const w1 = fakeWatcher();
    const w2 = fakeWatcher();
    const w3 = fakeWatcher();
    registry.register(w1);
    registry.register(w2);
    registry.register(w3);
    registry.closeAll();
    expect(w1.close).toHaveBeenCalledTimes(1);
    expect(w2.close).toHaveBeenCalledTimes(1);
    expect(w3.close).toHaveBeenCalledTimes(1);
    expect(registry.size()).toBe(0);
  });

  it("new ids continue incrementing after closeAll()", () => {
    const registry = createProjectWatcherRegistry();
    registry.register(fakeWatcher());
    registry.register(fakeWatcher());
    registry.closeAll();
    const nextId = registry.register(fakeWatcher());
    expect(nextId).toBe(3);
  });
});
