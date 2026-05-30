// @vitest-environment jsdom

import type { PreviewInfo } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPane } from "./PreviewPane";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const snake: PreviewInfo = {
  projectId: "project_1",
  title: "Snake Game",
  url: "http://127.0.0.1:4310/",
  startedAt: "2026-05-27T10:00:00.000Z",
};

describe("PreviewPane", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("points a sandboxed iframe at the preview url and shows the title", () => {
    act(() =>
      root.render(<PreviewPane preview={snake} onOpenExternal={vi.fn()} onClose={vi.fn()} />),
    );
    const frame = host.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("http://127.0.0.1:4310/");
    expect(frame?.getAttribute("sandbox")).toContain("allow-scripts");
    // Creations run on their own loopback origin, so they need same-origin to use
    // localStorage / IndexedDB / cookies (common in kid games). It stays safe
    // because that origin differs from the app's, so SOP still blocks the parent.
    expect(frame?.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(host.textContent).toContain("Snake Game");
  });

  it("opens the url in the system browser", () => {
    const onOpenExternal = vi.fn();
    act(() =>
      root.render(
        <PreviewPane preview={snake} onOpenExternal={onOpenExternal} onClose={vi.fn()} />,
      ),
    );
    clickByText(host, "Open in browser");
    expect(onOpenExternal).toHaveBeenCalledWith("http://127.0.0.1:4310/");
  });

  it("closes the pane", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(<PreviewPane preview={snake} onOpenExternal={vi.fn()} onClose={onClose} />),
    );
    clickByLabel(host, "Close preview");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("remounts the iframe when Reload is pressed so fresh files load", () => {
    act(() =>
      root.render(<PreviewPane preview={snake} onOpenExternal={vi.fn()} onClose={vi.fn()} />),
    );
    const before = host.querySelector("iframe");
    clickByText(host, "Reload");
    const after = host.querySelector("iframe");
    expect(after).not.toBe(before);
    expect(after?.getAttribute("src")).toBe("http://127.0.0.1:4310/");
  });

  it("focuses the iframe once it loads so game controls work without a click", () => {
    act(() =>
      root.render(<PreviewPane preview={snake} onOpenExternal={vi.fn()} onClose={vi.fn()} />),
    );
    const frame = host.querySelector("iframe");
    expect(frame).not.toBe(null);
    expect(document.activeElement).not.toBe(frame);
    act(() => {
      frame?.dispatchEvent(new Event("load"));
    });
    expect(document.activeElement).toBe(frame);
  });

  it("remounts the iframe when the reload signal changes (e.g. after a rebuild)", () => {
    act(() =>
      root.render(
        <PreviewPane preview={snake} reloadSignal={0} onOpenExternal={vi.fn()} onClose={vi.fn()} />,
      ),
    );
    const before = host.querySelector("iframe");
    act(() =>
      root.render(
        <PreviewPane preview={snake} reloadSignal={1} onOpenExternal={vi.fn()} onClose={vi.fn()} />,
      ),
    );
    expect(host.querySelector("iframe")).not.toBe(before);
  });
});

function clickByText(host: HTMLElement, label: string): void {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => button.click());
}

function clickByLabel(host: HTMLElement, label: string): void {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => button.click());
}
