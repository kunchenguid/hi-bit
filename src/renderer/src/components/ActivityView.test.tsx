// @vitest-environment jsdom

import type { CreationActivity } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityView } from "./ActivityView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("ActivityView", () => {
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
    vi.restoreAllMocks();
  });

  it("keys same-call steps by turn id", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "working",
        updatedAt: "",
        steps: [
          { callId: "w1", turnId: "bot_job_1", toolName: "write", status: "running", content: [] },
          { callId: "w1", turnId: "bot_job_2", toolName: "read", status: "running", content: [] },
        ],
      },
    ];

    act(() => root.render(<ActivityView activity={activity} onClose={() => {}} />));

    expect(error.mock.calls.join("\n")).not.toContain("Encountered two children with the same key");
  });

  it("labels failed steps as stopped", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "",
        steps: [
          { callId: "w1", turnId: "bot_job_1", toolName: "write", status: "failed", content: [] },
        ],
      },
    ];

    act(() => root.render(<ActivityView activity={activity} onClose={() => {}} />));

    expect(host.textContent).toContain("stopped");
    expect(host.textContent).not.toContain("retried");
  });

  it("shows finished no-step builds as completed activity", () => {
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "done",
        updatedAt: "2026-01-01T00:00:00.000Z",
        steps: [],
      },
    ];

    act(() => root.render(<ActivityView activity={activity} onClose={() => {}} />));

    expect(host.textContent).toContain("No visible steps");
    expect(host.textContent).not.toContain("Getting started");
  });

  it("uses the pre-unlock builder word before bot is unlocked", () => {
    act(() => root.render(<ActivityView activity={[]} onClose={() => {}} />));

    expect(host.textContent).toContain("Everything the builders worked on");
    expect(host.textContent).toContain("every step the builders took");
    expect(host.textContent).not.toContain("bot");
  });

  it("uses bot wording after bot is unlocked", () => {
    act(() => root.render(<ActivityView activity={[]} botUnlocked={true} onClose={() => {}} />));

    expect(host.textContent).toContain("Everything the bots worked on");
    expect(host.textContent).toContain("every step the bots took");
  });

  it("acts like a modal dialog and returns focus on close", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Open activity";
    document.body.prepend(trigger);
    trigger.focus();

    act(() => root.render(<ActivityView activity={[]} onClose={onClose} />));

    const dialog = host.querySelector<HTMLElement>("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);

    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("keeps tab focus inside the modal", () => {
    act(() => root.render(<ActivityView activity={[]} onClose={() => {}} />));

    const close = host.querySelector<HTMLButtonElement>("button");
    expect(close).not.toBeNull();
    close?.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });

    const propagated = close?.dispatchEvent(event);

    expect(propagated).toBe(false);
  });
});
