import { describe, expect, it, vi } from "vitest";
import { ClaudeSessionRegistry } from "./claudeSessionRegistry";

type FakeSession = {
  isAlive: () => boolean;
  close: (() => void) & { mock: { calls: unknown[][] } };
  alive: boolean;
};

function makeFakeSession(): FakeSession {
  const closeMock = vi.fn();
  const s: FakeSession = {
    alive: true,
    isAlive: () => s.alive,
    close: closeMock as unknown as FakeSession["close"],
  };
  closeMock.mockImplementation(() => {
    s.alive = false;
  });
  return s;
}

describe("ClaudeSessionRegistry", () => {
  it("creates a session lazily and reuses it across calls with the same key", () => {
    const registry = new ClaudeSessionRegistry<FakeSession>();
    const factory = vi.fn(() => makeFakeSession());

    const a = registry.getOrCreate("ada/kid", factory);
    const b = registry.getOrCreate("ada/kid", factory);

    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("creates separate sessions for different keys", () => {
    const registry = new ClaudeSessionRegistry<FakeSession>();
    const factory = vi.fn(() => makeFakeSession());

    const kid = registry.getOrCreate("ada/kid", factory);
    const parent = registry.getOrCreate("ada/parent", factory);

    expect(kid).not.toBe(parent);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("respawns when an existing session has died", () => {
    const registry = new ClaudeSessionRegistry<FakeSession>();
    const first = makeFakeSession();
    const second = makeFakeSession();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);

    const a = registry.getOrCreate("ada/kid", factory);
    expect(a).toBe(first);

    first.alive = false;

    const b = registry.getOrCreate("ada/kid", factory);
    expect(b).toBe(second);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("closeProfile() closes all sessions whose key starts with the profile prefix", () => {
    const registry = new ClaudeSessionRegistry<FakeSession>();
    const adaKid = makeFakeSession();
    const adaParent = makeFakeSession();
    const samKid = makeFakeSession();

    registry.getOrCreate("ada/kid", () => adaKid);
    registry.getOrCreate("ada/parent", () => adaParent);
    registry.getOrCreate("sam/kid", () => samKid);

    registry.closeProfile("ada");

    expect(adaKid.close).toHaveBeenCalled();
    expect(adaParent.close).toHaveBeenCalled();
    expect(samKid.close).not.toHaveBeenCalled();
  });

  it("closeAll() closes every session", () => {
    const registry = new ClaudeSessionRegistry<FakeSession>();
    const a = makeFakeSession();
    const b = makeFakeSession();
    registry.getOrCreate("k1", () => a);
    registry.getOrCreate("k2", () => b);

    registry.closeAll();

    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });

  it("after closeProfile, the next getOrCreate creates a fresh session", () => {
    const registry = new ClaudeSessionRegistry<FakeSession>();
    const first = makeFakeSession();
    const second = makeFakeSession();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);

    registry.getOrCreate("ada/kid", factory);
    registry.closeProfile("ada");
    const next = registry.getOrCreate("ada/kid", factory);

    expect(next).toBe(second);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("makeKey() composes profileId and role", () => {
    expect(ClaudeSessionRegistry.makeKey("ada", "kid")).toBe("ada/kid");
    expect(ClaudeSessionRegistry.makeKey("ada", "parent")).toBe("ada/parent");
  });
});
