import type { ThemePreference } from "@shared/config";

export type ThemeOptionId = "system" | "light" | "dark";

export type ThemeOption = {
  id: ThemeOptionId;
  label: string;
  theme: ThemePreference | null;
  pressed: boolean;
};

export function buildThemeOptions(current: ThemePreference | undefined): readonly ThemeOption[] {
  const active: ThemeOptionId =
    current === "light" ? "light" : current === "dark" ? "dark" : "system";
  return [
    { id: "system", label: "System", theme: null, pressed: active === "system" },
    { id: "light", label: "Light", theme: "light", pressed: active === "light" },
    { id: "dark", label: "Dark", theme: "dark", pressed: active === "dark" },
  ];
}
