import type { ThemePreference } from "@shared/config";

export type ThemeTarget = {
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

export function applyTheme(target: ThemeTarget, theme: ThemePreference | undefined): void {
  if (theme === "light" || theme === "dark") {
    if (target.getAttribute("data-theme") !== theme) {
      target.setAttribute("data-theme", theme);
    }
    return;
  }
  if (target.getAttribute("data-theme") !== null) {
    target.removeAttribute("data-theme");
  }
}
