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
    expect(button?.textContent).toContain("See all activities");

    act(() => button?.click());

    expect(onSeeAll).toHaveBeenCalledOnce();
  });

  it("reflects Bit thinking when a turn is running with no build activity", () => {
    act(() => root.render(<ActivityChip activity={[]} running={true} onSeeAll={vi.fn()} />));

    expect(host.textContent).toContain("Bit is thinking");
    expect(host.querySelector('[data-state="working"]')).not.toBeNull();
  });

  it("switches the see-all label to Logbook once that word is unlocked", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [],
      },
    ];

    act(() =>
      root.render(
        <ActivityChip activity={activity} seeAllLabel="Open Logbook" onSeeAll={vi.fn()} />,
      ),
    );

    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("Open Logbook");
    expect(button?.textContent).not.toContain("See all activities");
  });

  it("uses the unlocked collection label in the working headline", () => {
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

    act(() =>
      root.render(
        <ActivityChip activity={activity} collectionLabel="your Workshop" onSeeAll={vi.fn()} />,
      ),
    );

    expect(host.textContent).toContain("working on your Workshop");
  });
});
