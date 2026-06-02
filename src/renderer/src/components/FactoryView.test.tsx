// @vitest-environment jsdom

import type { CreationActivity } from "@shared/chat";
import type { ProjectSummary } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FactoryView } from "./FactoryView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function project(id: string, title: string, updatedAt: string): ProjectSummary {
  return {
    schemaVersion: 1,
    id,
    profileId: "p",
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

const DINO: CreationActivity = {
  projectId: "dino",
  title: "Dino Dash",
  status: "working",
  updatedAt: "2026-02-02T00:00:00.000Z",
  steps: [{ callId: "c1", turnId: "job1", toolName: "write", status: "running", content: [] }],
};

describe("FactoryView", () => {
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

  function render(props: Partial<Parameters<typeof FactoryView>[0]> = {}) {
    act(() =>
      root.render(
        <FactoryView
          creations={[
            project("dino", "Dino Dash", "2026-02-02T00:00:00.000Z"),
            project("maze", "My Maze", "2026-01-01T00:00:00.000Z"),
          ]}
          activity={[DINO]}
          playableProjectIds={new Set(["maze"])}
          onPlay={vi.fn()}
          onClose={vi.fn()}
          {...props}
        />,
      ),
    );
  }

  it("shows every creation as a machine, newest first", () => {
    render();
    const stations = host.querySelectorAll(".hb-factory-station");
    expect(stations).toHaveLength(2);
    // The working creation's ticker calls out what its bot is doing.
    expect(stations[0]?.textContent).toContain("Dino Dash");
    expect(stations[0]?.textContent).toContain("writing files");
    // The finished, playable creation reads ready.
    expect(stations[1]?.textContent).toContain("My Maze");
    expect(stations[1]?.textContent).toContain("ready to play");
  });

  it("opens a bot's Logbook when its face is tapped", () => {
    render();
    expect(host.querySelector(".hb-factory-logbook")).toBeNull();

    const bot = host.querySelector<HTMLButtonElement>(".hb-factory-bot");
    act(() => bot?.click());

    const logbook = host.querySelector(".hb-factory-logbook");
    expect(logbook).not.toBeNull();
    expect(logbook?.textContent).toContain("writing files");

    // Tapping again closes it.
    act(() => bot?.click());
    expect(host.querySelector(".hb-factory-logbook")).toBeNull();
  });

  it("plays a playable creation and closes", () => {
    const onPlay = vi.fn();
    const onClose = vi.fn();
    render({ onPlay, onClose });

    const play = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Play"),
    );
    act(() => play?.click());

    expect(onPlay).toHaveBeenCalledWith("maze");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not offer Play for a creation with no preview", () => {
    render();
    const dino = host.querySelectorAll(".hb-factory-machine")[0];
    expect(dino?.textContent).not.toContain("Play");
  });

  it("shows an empty state with no creations", () => {
    render({ creations: [], activity: [] });
    expect(host.textContent).toContain("No creations yet");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render({ onClose });

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
