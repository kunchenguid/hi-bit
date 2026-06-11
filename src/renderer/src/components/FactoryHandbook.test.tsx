// @vitest-environment jsdom
import type { LearningProgressView } from "@shared/learning";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FactoryHandbook } from "./FactoryHandbook";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const PROGRESS: LearningProgressView = {
  reachableTier: 2,
  tierLabel: "A richer creation shaped by specific feedback",
  arcs: [
    { id: "direct", title: "Direct one agent", blurb: "" },
    { id: "context", title: "Give Bit context", blurb: "" },
  ],
  skills: [
    {
      id: "ask-creation",
      arc: "direct",
      order: 1,
      kidLabel: "Ask Bit for a new creation",
      realSkill: "Kicking off work",
      requires: [],
      mastery: "fluent",
    },
    {
      id: "give-picture",
      arc: "context",
      order: 6,
      kidLabel: "Give Bit a picture to work from",
      realSkill: "Multimodal context",
      requires: [],
      mastery: "grasped",
    },
  ],
  roadmap: [],
  counts: { fluent: 1, grasped: 1, total: 2 },
  subjects: [
    {
      projectId: "project_math",
      title: "Math",
      creationTitle: "Math World",
      status: "active",
      goal: "Do the score math in my own games",
      skills: [
        { id: "count-up-score", label: "Count a game score up and down", mastery: "grasped" },
        { id: "add-two-digit", label: "Add two-digit numbers", mastery: "unseen" },
      ],
      counts: { fluent: 0, grasped: 1, total: 2 },
    },
  ],
};

describe("FactoryHandbook", () => {
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

  it("shows the builder's reach, mastery count, and skills grouped by arc", () => {
    act(() =>
      root.render(<FactoryHandbook builderName="Ada" progress={PROGRESS} onClose={vi.fn()} />),
    );

    expect(host.textContent).toContain("What you can do, Ada");
    expect(host.textContent).toContain("A richer creation shaped by specific feedback");
    expect(host.textContent).toContain("1/2");
    expect(host.textContent).toContain("Ask Bit for a new creation");
    expect(host.textContent).toContain("Mastered");
    expect(host.textContent).toContain("Got it");

    const mastered = host.querySelector('[data-mastery="fluent"]');
    expect(mastered?.getAttribute("data-done")).toBe("true");
  });

  it("shows the builder's learning subjects with their kid-facing skill labels", () => {
    act(() =>
      root.render(<FactoryHandbook builderName="Ada" progress={PROGRESS} onClose={vi.fn()} />),
    );

    expect(host.textContent).toContain("Math");
    expect(host.textContent).toContain("Count a game score up and down");
    expect(host.textContent).toContain("Add two-digit numbers");
    // Subject skills use the same kid mastery words as builder skills.
    expect(host.textContent).toContain("Not yet");
  });

  it("degrades gracefully before progress has loaded", () => {
    act(() => root.render(<FactoryHandbook builderName="Ada" progress={null} onClose={vi.fn()} />));
    expect(host.textContent).toContain("What you can do, Ada");
    expect(host.textContent).toContain("your first creation");
  });

  it("closes when the Close button is pressed", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(<FactoryHandbook builderName="Ada" progress={PROGRESS} onClose={onClose} />),
    );
    const closeButton = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Close",
    );
    act(() => closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
