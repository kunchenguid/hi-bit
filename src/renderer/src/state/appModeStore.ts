import { create } from "zustand";

export type AppMode = "kid" | "parent";

export type AppModeStore = {
  mode: AppMode;
  enterParent: () => void;
  exitParent: () => void;
};

export const useAppModeStore = create<AppModeStore>((set) => ({
  mode: "kid",
  enterParent: () => set({ mode: "parent" }),
  exitParent: () => set({ mode: "kid" }),
}));
