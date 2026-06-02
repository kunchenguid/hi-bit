// @vitest-environment jsdom

import type { CreationActivity } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityChip } from "./ActivityChip";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function factoryButton(host: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes("The Factory"),
  );
}

describe("ActivityChip", () => {
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

  it("opens the factory for persisted builds with no tool steps", () => {
    const onOpenFactory = vi.fn();
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [],
      },
    ];

    act(() => root.render(<ActivityChip activity={activity} onOpenFactory={onOpenFactory} />));

    const button = factoryButton(host);
    expect(button?.textContent).toContain("The Factory");

    act(() => button?.click());
    expect(onOpenFactory).toHaveBeenCalledOnce();
  });

  it("reflects Bit thinking when a turn is running with no build activity", () => {
    act(() => root.render(<ActivityChip activity={[]} running={true} onOpenFactory={vi.fn()} />));

    expect(host.textContent).toContain("Bit is thinking");
    expect(host.querySelector('[data-state="working"]')).not.toBeNull();
  });

  it("names the collection your factory in the working headline", () => {
    const activity: CreationActivity[] = [
      { projectId: "a", title: "A", status: "working", updatedAt: "", steps: [] },
      { projectId: "b", title: "B", status: "working", updatedAt: "", steps: [] },
    ];

    act(() => root.render(<ActivityChip activity={activity} onOpenFactory={vi.fn()} />));

    expect(host.textContent).toContain("working in your factory");
  });

  it("badges the Factory button with the count of bots building right now", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "dino",
        title: "Dino Dash",
        status: "working",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [
          { callId: "c1", turnId: "job1", toolName: "write", status: "running", content: [] },
          { callId: "c2", turnId: "job2", toolName: "edit", status: "running", content: [] },
        ],
      },
    ];

    act(() => root.render(<ActivityChip activity={activity} onOpenFactory={vi.fn()} />));

    expect(host.querySelector(".hb-factory-badge")?.textContent).toBe("2");
    expect(factoryButton(host)?.dataset.working).toBe("true");
  });

  it("offers a direct Play alongside the Factory when only one creation exists", () => {
    const onPlay = vi.fn();

    act(() =>
      root.render(
        <ActivityChip
          activity={[]}
          playProjectId="cat-jump"
          onPlay={onPlay}
          creationCount={1}
          onOpenFactory={vi.fn()}
        />,
      ),
    );

    const play = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Play"),
    );
    expect(play).toBeDefined();
    expect(factoryButton(host)).toBeDefined();

    act(() => play?.click());
    expect(onPlay).toHaveBeenCalledWith("cat-jump");
  });

  it("drops the direct Play once there is more than one creation", () => {
    act(() =>
      root.render(
        <ActivityChip
          activity={[]}
          playProjectId="cat-jump"
          onPlay={vi.fn()}
          creationCount={2}
          onOpenFactory={vi.fn()}
        />,
      ),
    );

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.some((button) => button.textContent?.trim() === "▶ Play")).toBe(false);
    expect(factoryButton(host)).toBeDefined();
  });

  it("hides the Factory button until there is anything to show", () => {
    act(() =>
      root.render(<ActivityChip activity={[]} creationCount={0} onOpenFactory={vi.fn()} />),
    );
    expect(factoryButton(host)).toBeUndefined();
  });

  it("always reserves the detail line so the bar height never shifts", () => {
    act(() => root.render(<ActivityChip activity={[]} onOpenFactory={vi.fn()} />));

    const detail = host.querySelector(".hb-activity-detail");
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toBe("");
  });

  it("fills the reserved detail line when there is a detail to show", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [],
      },
    ];

    act(() => root.render(<ActivityChip activity={activity} onOpenFactory={vi.fn()} />));

    const detail = host.querySelector(".hb-activity-detail");
    expect(detail?.textContent).toContain("last worked on Cat Jump");
  });
});
