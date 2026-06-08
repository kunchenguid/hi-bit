import type { KeyboardEvent } from "react";

/**
 * Keyboard handling for a modal dialog: Escape closes it, and Tab/Shift+Tab
 * cycle focus within the dialog instead of escaping to the page behind it -
 * honoring the `aria-modal` contract for keyboard users.
 */
export function keepFocusInside(
  event: KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
  close: () => void,
): void {
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
}
