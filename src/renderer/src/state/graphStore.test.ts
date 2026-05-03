import type { DreamValidation } from "@shared/dreams";
import type { KnowledgeGraphValidation, KnowledgePoint } from "@shared/knowledgeGraph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphStore } from "./graphStore";

type HiBitApi = typeof window.hibit;

function mockHiBit(partial: Partial<HiBitApi>): void {
  (globalThis as unknown as { window: { hibit: HiBitApi } }).window = {
    hibit: {
      getAppInfo: vi.fn(),
      listProfiles: vi.fn(),
      createProfile: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      getKnowledgeGraph: vi.fn(),
      getDreams: vi.fn(),
      ...partial,
    } as HiBitApi,
  };
}

function fakeKp(overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id: "html-doc-shell",
    title_parent: "HTML document shell",
    title_kid: "making your first webpage",
    area: "html",
    prereqs: [],
    introduces: [],
    mastery_signals: {
      saw_it: "saw",
      did_with_help: "did with help",
      did_unprompted: "did unprompted",
      explained_it: "explained",
    },
    ...overrides,
  };
}

beforeEach(() => {
  useGraphStore.setState({
    graph: null,
    library: null,
    graphErrors: [],
    dreamErrors: [],
    status: "idle",
    error: null,
  });
});

describe("useGraphStore", () => {
  it("loads graph and dreams in parallel on success", async () => {
    const kp = fakeKp();
    const graphResult: KnowledgeGraphValidation = {
      ok: true,
      graph: { nodes: [kp], byId: { [kp.id]: kp } },
    };
    const dreamsResult: DreamValidation = {
      ok: true,
      library: { dreams: [], byId: {} },
    };
    mockHiBit({
      getKnowledgeGraph: vi.fn().mockResolvedValue(graphResult),
      getDreams: vi.fn().mockResolvedValue(dreamsResult),
    });

    const promise = useGraphStore.getState().load();
    expect(useGraphStore.getState().status).toBe("loading");
    await promise;

    const state = useGraphStore.getState();
    expect(state.status).toBe("ready");
    expect(state.graph?.nodes).toHaveLength(1);
    expect(state.library?.dreams).toEqual([]);
    expect(state.graphErrors).toEqual([]);
    expect(state.dreamErrors).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("captures graph validation errors without blocking dream loading", async () => {
    const graphResult: KnowledgeGraphValidation = {
      ok: false,
      errors: [{ kind: "duplicate-id", id: "html-doc-shell" }],
    };
    const dreamsResult: DreamValidation = {
      ok: true,
      library: { dreams: [], byId: {} },
    };
    mockHiBit({
      getKnowledgeGraph: vi.fn().mockResolvedValue(graphResult),
      getDreams: vi.fn().mockResolvedValue(dreamsResult),
    });

    await useGraphStore.getState().load();

    const state = useGraphStore.getState();
    expect(state.status).toBe("ready");
    expect(state.graph).toBeNull();
    expect(state.graphErrors).toEqual([{ kind: "duplicate-id", id: "html-doc-shell" }]);
    expect(state.library?.dreams).toEqual([]);
  });

  it("captures dream validation errors alongside a valid graph", async () => {
    const kp = fakeKp();
    const graphResult: KnowledgeGraphValidation = {
      ok: true,
      graph: { nodes: [kp], byId: { [kp.id]: kp } },
    };
    const dreamsResult: DreamValidation = {
      ok: false,
      errors: [{ kind: "unresolved-requires", id: "hello-card", prereq: "missing-kp" }],
    };
    mockHiBit({
      getKnowledgeGraph: vi.fn().mockResolvedValue(graphResult),
      getDreams: vi.fn().mockResolvedValue(dreamsResult),
    });

    await useGraphStore.getState().load();

    const state = useGraphStore.getState();
    expect(state.status).toBe("ready");
    expect(state.graph?.nodes).toHaveLength(1);
    expect(state.library).toBeNull();
    expect(state.dreamErrors).toEqual([
      { kind: "unresolved-requires", id: "hello-card", prereq: "missing-kp" },
    ]);
  });

  it("records an error when an IPC call rejects", async () => {
    mockHiBit({
      getKnowledgeGraph: vi.fn().mockRejectedValue(new Error("ipc down")),
      getDreams: vi.fn().mockResolvedValue({ ok: true, library: { dreams: [], byId: {} } }),
    });

    await useGraphStore.getState().load();

    const state = useGraphStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("ipc down");
    expect(state.graph).toBeNull();
  });
});
