import type { AgentId, HiBitConfig } from "@shared/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConfigStore } from "./configStore";

type HiBitApi = typeof window.hibit;

function mockHiBit(partial: Partial<HiBitApi>): void {
  (globalThis as unknown as { window: { hibit: HiBitApi } }).window = {
    hibit: {
      getAppInfo: vi.fn(),
      listProfiles: vi.fn(),
      createProfile: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      hasParentPin: vi.fn().mockResolvedValue(false),
      setParentPin: vi.fn(),
      verifyParentPin: vi.fn(),
      clearParentPin: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

function fakeConfig(overrides: Partial<HiBitConfig> = {}): HiBitConfig {
  return { version: 2, ...overrides };
}

beforeEach(() => {
  useConfigStore.setState({
    config: null,
    status: "idle",
    error: null,
    hasParentPin: false,
  });
});

describe("useConfigStore", () => {
  it("loads config and parent-pin presence in parallel", async () => {
    const config = fakeConfig({ defaultAgent: "claude" });
    mockHiBit({
      getConfig: vi.fn().mockResolvedValue(config),
      hasParentPin: vi.fn().mockResolvedValue(true),
    });

    const promise = useConfigStore.getState().load();
    expect(useConfigStore.getState().status).toBe("loading");
    await promise;

    const state = useConfigStore.getState();
    expect(state.status).toBe("ready");
    expect(state.config).toEqual(config);
    expect(state.hasParentPin).toBe(true);
    expect(state.error).toBeNull();
  });

  it("records the error when load fails", async () => {
    mockHiBit({
      getConfig: vi.fn().mockRejectedValue(new Error("fs down")),
    });

    await useConfigStore.getState().load();

    const state = useConfigStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("fs down");
    expect(state.config).toBeNull();
  });

  it("setDefaultAgent persists the selected ACP agent", async () => {
    useConfigStore.setState({
      config: fakeConfig(),
      status: "ready",
    });
    const updated = fakeConfig({ defaultAgent: "codex" });
    const updateConfig = vi.fn().mockResolvedValue(updated);
    mockHiBit({ updateConfig });

    await useConfigStore.getState().setDefaultAgent("codex");

    expect(updateConfig).toHaveBeenCalledWith({
      version: 2,
      defaultAgent: "codex",
    });
    expect(useConfigStore.getState().config).toEqual(updated);
  });

  it("setTheme persists a light theme preference", async () => {
    useConfigStore.setState({
      config: fakeConfig({ defaultAgent: "claude" }),
      status: "ready",
    });
    const updated = fakeConfig({
      defaultAgent: "claude",
      theme: "light",
    });
    const updateConfig = vi.fn().mockResolvedValue(updated);
    mockHiBit({ updateConfig });

    await useConfigStore.getState().setTheme("light");

    expect(updateConfig).toHaveBeenCalledWith({
      version: 2,
      defaultAgent: "claude",
      theme: "light",
    });
    expect(useConfigStore.getState().config).toEqual(updated);
  });

  it("setTheme with null clears an existing theme preference", async () => {
    useConfigStore.setState({
      config: fakeConfig({ theme: "dark" }),
      status: "ready",
    });
    const updated = fakeConfig();
    const updateConfig = vi.fn().mockResolvedValue(updated);
    mockHiBit({ updateConfig });

    await useConfigStore.getState().setTheme(null);

    expect(updateConfig).toHaveBeenCalledWith({ version: 2 });
    expect(useConfigStore.getState().config).toEqual(updated);
  });

  it("setDefaultAgent records the choice without path detection", async () => {
    useConfigStore.setState({
      config: fakeConfig(),
      status: "ready",
    });
    const updateConfig = vi.fn().mockImplementation((cfg: HiBitConfig) => Promise.resolve(cfg));
    mockHiBit({ updateConfig });

    const agent: AgentId = "claude";
    await useConfigStore.getState().setDefaultAgent(agent);

    expect(updateConfig).toHaveBeenCalledWith({
      version: 2,
      defaultAgent: "claude",
    });
  });

  it("setParentPin invokes IPC and flips hasParentPin to true", async () => {
    const setParentPin = vi.fn().mockResolvedValue(undefined);
    mockHiBit({ setParentPin });

    await useConfigStore.getState().setParentPin("9876");

    expect(setParentPin).toHaveBeenCalledWith("9876");
    expect(useConfigStore.getState().hasParentPin).toBe(true);
  });

  it("verifyParentPin returns the IPC result without mutating store state", async () => {
    useConfigStore.setState({ hasParentPin: true });
    const verifyParentPin = vi.fn().mockResolvedValue(true);
    mockHiBit({ verifyParentPin });

    const ok = await useConfigStore.getState().verifyParentPin("9876");

    expect(ok).toBe(true);
    expect(verifyParentPin).toHaveBeenCalledWith("9876");
    expect(useConfigStore.getState().hasParentPin).toBe(true);
  });

  it("clearParentPin invokes IPC and flips hasParentPin to false", async () => {
    useConfigStore.setState({ hasParentPin: true });
    const clearParentPin = vi.fn().mockResolvedValue(undefined);
    mockHiBit({ clearParentPin });

    await useConfigStore.getState().clearParentPin();

    expect(clearParentPin).toHaveBeenCalled();
    expect(useConfigStore.getState().hasParentPin).toBe(false);
  });
});
