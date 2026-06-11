// @vitest-environment jsdom
import type { LearningProgressView } from "@shared/learning";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParentProgressWindow } from "./ParentProgressWindow";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const PROGRESS: LearningProgressView = {
  reachableTier: 2,
  tierLabel: "A richer creation shaped by specific feedback",
  arcs: [{ id: "direct", title: "Direct one agent", blurb: "" }],
  skills: [
    {
      id: "ask-creation",
      arc: "direct",
      order: 1,
      kidLabel: "Ask Bit for a new creation",
      realSkill: "Kicking off work / stating intent",
      requires: [],
      mastery: "fluent",
    },
    {
      id: "specific-feedback",
      arc: "direct",
      order: 3,
      kidLabel: "Say exactly what you want changed",
      realSkill: "Precise specification",
      requires: [],
      mastery: "grasped",
    },
  ],
  roadmap: [
    {
      id: "r1",
      title: "A whole Minecraft",
      status: "parked",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  counts: { fluent: 1, grasped: 1, total: 2 },
  subjects: [
    {
      projectId: "project_math",
      title: "Math",
      creationTitle: "Math World",
      status: "active",
      goal: "Do the score math in my own games",
      skills: [
        {
          id: "count-up-score",
          label: "Count a game score up and down",
          parentLabel: "Addition and subtraction within 100",
          mastery: "grasped",
        },
      ],
      counts: { fluent: 0, grasped: 1, total: 1 },
    },
  ],
};

describe("ParentProgressWindow", () => {
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

  it("explains the real skills, reach, and parked ideas to a grown-up", () => {
    act(() => root.render(<ParentProgressWindow builderName="Ada" progress={PROGRESS} />));

    expect(host.textContent).toContain("What Ada is learning");
    expect(host.textContent).toMatch(/agentic engineering/i);
    expect(host.textContent).toContain("Precise specification");
    expect(host.textContent).toContain("fluent");
    // Reach and parked ambition both surface for the parent.
    expect(host.textContent).toContain("a richer creation shaped by specific feedback");
    expect(host.textContent).toContain("A whole Minecraft");
  });

  it("shows each learning subject with its goal and precise grown-up skill names", () => {
    act(() => root.render(<ParentProgressWindow builderName="Ada" progress={PROGRESS} />));

    expect(host.textContent).toContain("Subject: Math");
    expect(host.textContent).toContain("Goal: Do the score math in my own games");
    // The parent sees the precise name, not the kid phrasing.
    expect(host.textContent).toContain("Addition and subtraction within 100");
    expect(host.textContent).toContain("done with help");
  });

  it("shows an empty state before any building has happened", () => {
    act(() => root.render(<ParentProgressWindow builderName="Ada" progress={null} />));
    expect(host.textContent).toContain("What Ada is learning");
    expect(host.textContent).toMatch(/fills in as Ada builds/i);
  });
});
