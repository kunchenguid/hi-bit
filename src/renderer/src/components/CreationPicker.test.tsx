// @vitest-environment jsdom

import type { ProjectSummary } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreationPicker } from "./CreationPicker";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function makeCreation(id: string, title: string, updatedAt: string): ProjectSummary {
  return {
    schemaVersion: 1,
    id,
    factoryId: "default",
    profileId: "profile-1",
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

describe("CreationPicker", () => {
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

  function rowButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>(".hb-creation-pick"));
  }

  it("lists creations newest first and plays the chosen one", () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();

    act(() =>
      root.render(
        <CreationPicker
          creations={[
            makeCreation("old", "Cat Jump", "2026-01-01T00:00:00.000Z"),
            makeCreation("new", "Star Maze", "2026-02-01T00:00:00.000Z"),
          ]}
          playableProjectIds={new Set(["old", "new"])}
          onPlay={onPlay}
          onClose={onClose}
        />,
      ),
    );

    const rows = rowButtons();
    // Newest (Star Maze) sorts to the top.
    expect(rows[0]?.textContent).toContain("Star Maze");
    expect(rows[1]?.textContent).toContain("Cat Jump");

    act(() => rows[0]?.click());
    expect(onPlay).toHaveBeenCalledWith("new");
    // Choosing also closes the picker.
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("marks a creation with no preview yet and does not play it", () => {
    const onPlay = vi.fn();

    act(() =>
      root.render(
        <CreationPicker
          creations={[makeCreation("p1", "Sketch", "2026-01-01T00:00:00.000Z")]}
          playableProjectIds={new Set()}
          onPlay={onPlay}
          onClose={vi.fn()}
        />,
      ),
    );

    const row = rowButtons()[0];
    expect(row?.textContent).toContain("No preview yet");
    expect(row?.disabled).toBe(true);

    act(() => row?.click());
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();

    act(() =>
      root.render(
        <CreationPicker
          creations={[makeCreation("p1", "Sketch", "2026-01-01T00:00:00.000Z")]}
          playableProjectIds={new Set(["p1"])}
          onPlay={vi.fn()}
          onClose={onClose}
        />,
      ),
    );

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
