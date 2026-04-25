import type { DreamLibrary, DreamValidationError } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgeGraphValidationError } from "@shared/knowledgeGraph";
import { create } from "zustand";

export type GraphStoreStatus = "idle" | "loading" | "ready" | "error";

export type GraphStore = {
  graph: KnowledgeGraph | null;
  library: DreamLibrary | null;
  graphErrors: KnowledgeGraphValidationError[];
  dreamErrors: DreamValidationError[];
  status: GraphStoreStatus;
  error: string | null;
  load: () => Promise<void>;
};

export const useGraphStore = create<GraphStore>((set, get) => ({
  graph: null,
  library: null,
  graphErrors: [],
  dreamErrors: [],
  status: "idle",
  error: null,

  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const [graphResult, dreamsResult] = await Promise.all([
        window.hibit.getKnowledgeGraph(),
        window.hibit.getDreams(),
      ]);
      set({
        graph: graphResult.ok ? graphResult.graph : null,
        graphErrors: graphResult.ok ? [] : graphResult.errors,
        library: dreamsResult.ok ? dreamsResult.library : null,
        dreamErrors: dreamsResult.ok ? [] : dreamsResult.errors,
        status: "ready",
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load graph",
      });
    }
  },
}));
