// @vitest-environment jsdom

import type { CreationActivity } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityChip } from "./ActivityChip";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
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

  it("opens the full log for persisted builds with no tool steps", () => {
    const onSeeAll = vi.fn();
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [],
      },
    ];

    act(() => root.render(<ActivityChip activity={activity} onSeeAll={onSeeAll} />));

    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("Open Logbook");

    act(() => button?.click());

    expect(onSeeAll).toHaveBeenCalledOnce();
  });

  it("reflects Bit thinking when a turn is running with no build activity", () => {
    act(() => root.render(<ActivityChip activity={[]} running={true} onSeeAll={vi.fn()} />));

    expect(host.textContent).toContain("Bit is thinking");
    expect(host.querySelector('[data-state="working"]')).not.toBeNull();
  });

  it("labels the see-all button Open Logbook", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [],
      },
    ];

    act(() => root.render(<ActivityChip activity={activity} onSeeAll={vi.fn()} />));

    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("Open Logbook");
    expect(button?.textContent).not.toContain("See all activities");
  });

  it("names the collection your Workshop in the working headline", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "a",
        title: "A",
        status: "working",
        updatedAt: "",
        steps: [],
      },
      {
        projectId: "b",
        title: "B",
        status: "working",
        updatedAt: "",
        steps: [],
      },
    ];

    act(() => root.render(<ActivityChip activity={activity} onSeeAll={vi.fn()} />));

    expect(host.textContent).toContain("working on your Workshop");
  });

  it("always reserves the detail line so the bar height never shifts", () => {
    // Idle with nothing built yet: there is no detail string to show.
    act(() => root.render(<ActivityChip activity={[]} onSeeAll={vi.fn()} />));

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

    act(() => root.render(<ActivityChip activity={activity} onSeeAll={vi.fn()} />));

    const detail = host.querySelector(".hb-activity-detail");
    expect(detail?.textContent).toContain("last worked on Cat Jump");
  });
});
