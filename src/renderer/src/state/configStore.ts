import type { AgentId, HiBitConfig, ThemePreference } from "@shared/config";
import { create } from "zustand";

export type ConfigStoreStatus = "idle" | "loading" | "ready" | "error";

export type ConfigStore = {
  config: HiBitConfig | null;
  status: ConfigStoreStatus;
  error: string | null;
  hasParentPin: boolean;
  load: () => Promise<void>;
  setDefaultAgent: (agent: AgentId) => Promise<void>;
  setTheme: (theme: ThemePreference | null) => Promise<void>;
  setParentPin: (pin: string) => Promise<void>;
  verifyParentPin: (pin: string) => Promise<boolean>;
  clearParentPin: () => Promise<void>;
};

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  status: "idle",
  error: null,
  hasParentPin: false,

  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const [config, hasPin] = await Promise.all([
        window.hibit.getConfig(),
        window.hibit.hasParentPin(),
      ]);
      set({ config, hasParentPin: hasPin, status: "ready" });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load config",
      });
    }
  },

  setDefaultAgent: async (agent) => {
    const { config } = get();
    if (!config) throw new Error("Config not loaded");
    const next: HiBitConfig = {
      ...config,
      defaultAgent: agent,
    };
    const saved = await window.hibit.updateConfig(next);
    set({ config: saved });
  },

  setTheme: async (theme) => {
    const { config } = get();
    if (!config) throw new Error("Config not loaded");
    const { theme: _dropped, ...rest } = config;
    const next: HiBitConfig = theme ? { ...rest, theme } : rest;
    const saved = await window.hibit.updateConfig(next);
    set({ config: saved });
  },

  setParentPin: async (pin) => {
    await window.hibit.setParentPin(pin);
    set({ hasParentPin: true });
  },

  verifyParentPin: (pin) => window.hibit.verifyParentPin(pin),

  clearParentPin: async () => {
    await window.hibit.clearParentPin();
    set({ hasParentPin: false });
  },
}));
