// @vitest-environment jsdom

import type { CreationActivity, ToolActivity } from "@shared/chat";
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

function step(turnId: string, toolName: string, status: ToolActivity["status"]): ToolActivity {
  return { callId: `${turnId}:${toolName}`, turnId, toolName, status, content: [] };
}

const DINO: CreationActivity = {
  projectId: "dino",
  title: "Dino Dash",
  status: "working",
  updatedAt: "2026-02-02T00:00:00.000Z",
  steps: [{ callId: "c1", turnId: "job1", toolName: "write", status: "running", content: [] }],
};

function task(turnId: string, toolName: string, status: ToolActivity["status"], summary: string) {
  return { ...step(turnId, toolName, status), summary };
}

/** One creation built over three bots: two finished, one still working. */
const ROCKET: CreationActivity = {
  projectId: "rocket",
  title: "Rocket",
  status: "working",
  updatedAt: "2026-03-03T00:00:00.000Z",
  steps: [
    task("job1", "write", "completed", "build the rocket body"),
    step("job1", "read", "completed"),
    task("job2", "edit", "completed", "paint it red"),
    task("job3", "write", "running", "add booster flames"),
  ],
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

  function renderRocket() {
    render({
      creations: [project("rocket", "Rocket", "2026-03-03T00:00:00.000Z")],
      activity: [ROCKET],
      playableProjectIds: new Set(),
    });
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

  it("shows only working bots on the floor and collapses finished bots into a Logbook pill", () => {
    renderRocket();
    const station = host.querySelector(".hb-factory-station");
    // Only the one in-flight bot stands on the bench.
    expect(station?.querySelectorAll(".hb-factory-bot")).toHaveLength(1);
    // The two finished bots collapse into a single Logbook pill carrying their count.
    const pill = station?.querySelector(".hb-factory-logbook-pill");
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain("Logbook");
    expect(pill?.textContent).toContain("2");
  });

  it("drops the status light", () => {
    renderRocket();
    expect(host.querySelector(".hb-factory-light")).toBeNull();
  });

  it("opens a master/detail Logbook panel listing all bots newest-first when the pill is tapped", () => {
    renderRocket();
    expect(host.querySelector(".hb-factory-logpanel")).toBeNull();

    const pill = host.querySelector<HTMLButtonElement>(".hb-factory-logbook-pill");
    act(() => pill?.click());

    const panel = host.querySelector(".hb-factory-logpanel");
    expect(panel).not.toBeNull();
    // Every bot of the creation is a chapter, working and done alike.
    expect(panel?.querySelectorAll(".hb-factory-chapter")).toHaveLength(3);
    // The newest bot (still working) is selected and its steps fill the detail scroll.
    const steps = panel?.querySelector(".hb-factory-logsteps");
    expect(steps?.textContent).toContain("writing files");
    expect(panel?.textContent).toContain("building now");
  });

  it("labels each Logbook chapter by the bot's task, not its latest tool", () => {
    renderRocket();
    act(() => host.querySelector<HTMLButtonElement>(".hb-factory-logbook-pill")?.click());

    const names = Array.from(host.querySelectorAll(".hb-factory-chapter-name")).map(
      (node) => node.textContent,
    );
    expect(names).toContain("build the rocket body");
    expect(names).toContain("paint it red");
    expect(names).toContain("add booster flames");
    // The raw tool verb is no longer used as the bot's name.
    expect(names).not.toContain("writing files");
  });

  it("switches the detail when another chapter is selected", () => {
    renderRocket();
    act(() => host.querySelector<HTMLButtonElement>(".hb-factory-logbook-pill")?.click());

    const chapters = host.querySelectorAll<HTMLButtonElement>(".hb-factory-chapter");
    // Chapters are newest-first, so the last one is the oldest bot (job1: write + read).
    act(() => chapters[chapters.length - 1]?.click());

    const steps = host.querySelector(".hb-factory-logsteps");
    expect(steps?.textContent).toContain("writing files");
    expect(steps?.textContent).toContain("reading files");
    expect(host.querySelector(".hb-factory-logpanel")?.textContent).toContain("all done");
  });

  it("opens the Logbook panel focused on a working bot when its face is tapped", () => {
    renderRocket();
    expect(host.querySelector(".hb-factory-logpanel")).toBeNull();

    const bot = host.querySelector<HTMLButtonElement>(".hb-factory-bot");
    act(() => bot?.click());

    const panel = host.querySelector(".hb-factory-logpanel");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("building now");

    // Tapping the same face again closes the panel.
    act(() => host.querySelector<HTMLButtonElement>(".hb-factory-bot")?.click());
    expect(host.querySelector(".hb-factory-logpanel")).toBeNull();
  });

  it("closes the Logbook panel with its close control", () => {
    renderRocket();
    act(() => host.querySelector<HTMLButtonElement>(".hb-factory-logbook-pill")?.click());
    expect(host.querySelector(".hb-factory-logpanel")).not.toBeNull();

    act(() => host.querySelector<HTMLButtonElement>(".hb-factory-logpanel-close")?.click());
    expect(host.querySelector(".hb-factory-logpanel")).toBeNull();
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
