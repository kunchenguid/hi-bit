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
});
