// @vitest-environment jsdom
import type { DreamLibrary } from "@shared/dreams";
import type { ParentFlag } from "@shared/flag";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { Profile } from "@shared/profile";
import type { Progress } from "@shared/progress";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFlagStore } from "../state/flagStore";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
import { ParentHome } from "./ParentHome";

vi.mock("./parent/ParentAudit", () => ({
  ParentAudit: () => <section>Audit detail</section>,
}));
vi.mock("./parent/ParentChat", () => ({
  ParentChat: () => <section>Parent chat detail</section>,
}));
vi.mock("./parent/ParentDirectivesOverview", () => ({
  ParentDirectivesOverview: () => <section>Directives detail</section>,
}));
vi.mock("./parent/ParentDreamHistory", () => ({
  ParentDreamHistory: () => <section>Dream history detail</section>,
}));
vi.mock("./parent/ParentFlagsOverview", () => ({
  ParentFlagsOverview: () => <section>Flags detail</section>,
}));
vi.mock("./parent/ParentMasteryGrid", () => ({
  ParentMasteryGrid: () => <section>Mastery detail</section>,
}));
vi.mock("./parent/ParentNextKp", () => ({
  ParentNextKp: () => <section>Next KP detail</section>,
}));
vi.mock("./parent/ParentProjectsReview", () => ({
  ParentProjectsReview: () => <section>Projects detail</section>,
}));
vi.mock("./parent/ParentSessionsOverview", () => ({
  ParentSessionsOverview: () => <section>Sessions detail</section>,
}));
vi.mock("./parent/ParentSettings", () => ({
  ParentSettings: () => <section>Settings detail</section>,
}));

const kp: KnowledgePoint = {
  id: "css-spacing",
  title_parent: "CSS spacing and layout",
  title_kid: "Put things where you want them",
  area: "css",
  prereqs: [],
  introduces: ["margin", "padding"],
  mastery_signals: {
    saw_it: "Recognizes spacing in CSS.",
    did_with_help: "Adds spacing with help.",
    did_unprompted: "Adds spacing alone.",
    explained_it: "Explains margin and padding.",
  },
};

const graph: KnowledgeGraph = {
  nodes: [kp],
  byId: { [kp.id]: kp },
};

const library: DreamLibrary = {
  dreams: [
    {
      id: "pixel-pet",
      title_parent: "Pixel pet arcade",
      title_kid: "Pixel pet",
      summary_kid: "Make a pet that reacts to clicks.",
      categories: ["arcade"],
      interest_tags: ["pets"],
      requires: [kp.id],
      style_hints: ["bright"],
      emoji: "pet",
      difficulty: 2,
    },
  ],
  byId: {},
};
library.byId["pixel-pet"] = library.dreams[0];

const profile: Profile = {
  id: "kid-1",
  name: "Ada",
  age: 9,
  interests: ["cats", "drawing", "space"],
  sessions: { kid: "kid-session", parent: "parent-session" },
  createdAt: "2026-01-01T00:00:00.000Z",
  currentDreamId: "pixel-pet",
  dreamHistory: ["pixel-pet"],
};

const progress: Progress = {
  version: 1,
  knowledgePoints: {},
  projects: [
    {
      dreamId: "pixel-pet",
      slug: "pixel-pet-arcade",
      startedAt: "2026-01-02T00:00:00.000Z",
      lastActiveAt: "2026-01-03T00:00:00.000Z",
    },
  ],
  sessions: [],
  dreamHistory: ["pixel-pet"],
};

const flag: ParentFlag = {
  flaggedAt: "2026-01-04T00:00:00.000Z",
  sessionId: "kid-session",
  messageTimestamp: "2026-01-04T00:00:00.000Z",
  messageRole: "kid",
  messageKind: "assistant_message",
  messageText: "Too much help.",
  reason: "Parent review",
};

describe("ParentHome dashboard", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    useGraphStore.setState({
      graph,
      library,
      status: "ready",
      error: null,
      graphErrors: [],
      dreamErrors: [],
      load: vi.fn(async () => {}),
    });
    useProgressStore.setState({
      progress,
      profileId: profile.id,
      status: "ready",
      error: null,
      updateError: null,
      load: vi.fn(async () => {}),
      updateStatus: vi.fn(async () => {}),
      setSkipped: vi.fn(async () => {}),
    });
    useFlagStore.setState({
      profileId: profile.id,
      flags: [],
      status: "ready",
      error: null,
      writeStatus: "idle",
      writeError: null,
      load: vi.fn(async () => {}),
      save: vi.fn(async () => true),
      remove: vi.fn(async () => true),
    });
    useProfileStore.setState({ selectProfile: vi.fn() });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useGraphStore.setState({ graph: null, library: null, status: "idle" });
    useProgressStore.setState({ progress: null, profileId: null, status: "idle" });
    useFlagStore.setState({ flags: [], profileId: null, status: "idle" });
  });

  it("opens with a concise learner overview instead of dumping every detail section", async () => {
    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Ada's Hi-Bit");
    expect(host.textContent).toContain("Age 9 · cats, drawing, space");
    expect(host.textContent).toContain("Ada is working on Pixel pet arcade.");
    expect(host.textContent).toContain("Current dream");
    expect(host.textContent).toContain("Next learning step");
    expect(host.textContent).toContain("CSS spacing and layout");
    expect(host.textContent).toContain("Needs attention");
    expect(host.textContent).not.toContain("Mastery detail");
    expect(host.textContent).not.toContain("Projects detail");
    expect(host.textContent).not.toContain("Audit detail");
  });

  it("summarizes flagged messages in the overview", async () => {
    useFlagStore.setState({ flags: [flag], profileId: profile.id, status: "ready" });

    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("1 flagged message needs review.");
  });

  it("does not summarize stale progress from another profile", async () => {
    useProgressStore.setState({ progress, profileId: "kid-2", status: "ready" });

    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Loading progress...");
    expect(host.textContent).toContain(
      "0 saved projects · 0 of 1 skills practiced with help or better.",
    );
    expect(host.textContent).not.toContain("CSS spacing and layout");
    expect(host.textContent).not.toContain("1 saved project");
  });

  it("reports when flagged message status cannot be checked", async () => {
    useFlagStore.setState({ flags: [], profileId: profile.id, status: "error" });

    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Flagged-message status could not be checked.");
    expect(host.textContent).not.toContain("No flagged messages need review.");
  });

  it("does not describe a loading dream library as no dream picked", async () => {
    useGraphStore.setState({ library: null, status: "loading" });

    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Ada's current dream is loading.");
    expect(host.textContent).toContain("Loading dream...");
    expect(host.textContent).not.toContain("Ada has not picked a dream yet.");
  });

  it("reports when the current dream is missing from the library", async () => {
    const missingDreamProfile = { ...profile, currentDreamId: "lost-dream" };

    await act(async () => {
      root.render(<ParentHome profile={missingDreamProfile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Ada's current dream is missing from the library.");
    expect(host.textContent).toContain("lost-dream");
    expect(host.textContent).not.toContain("Ada has not picked a dream yet.");
  });

  it("reports progress load failures instead of empty progress", async () => {
    useProgressStore.setState({ progress: null, profileId: profile.id, status: "error" });

    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Progress could not be loaded.");
    expect(host.textContent).toContain("Could not check the next learning step.");
    expect(host.textContent).not.toContain("0 saved projects");
  });

  it("does not promise that Activity retries failed flag loads", async () => {
    useFlagStore.setState({ flags: [], profileId: profile.id, status: "error" });

    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    expect(host.textContent).toContain("Open Activity to inspect the safety review list.");
    expect(host.textContent).not.toContain("Open Activity to retry loading the safety review list.");
  });

  it("groups detailed tools under parent-readable sections", async () => {
    await act(async () => {
      root.render(<ParentHome profile={profile} onLock={() => {}} />);
    });

    const learningButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Learning",
    );
    expect(learningButton).toBeDefined();

    await act(async () => {
      learningButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Mastery detail");
    expect(host.textContent).toContain("Dream history detail");
    expect(host.textContent).not.toContain("Parent chat detail");

    const guidanceButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Guidance",
    );
    await act(async () => {
      guidanceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Parent chat detail");
    expect(host.textContent).toContain("Directives detail");
    expect(host.textContent).not.toContain("Mastery detail");
  });
});
