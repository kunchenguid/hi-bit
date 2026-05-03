// @vitest-environment jsdom
import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Profile } from "@shared/profile";
import { emptyProgress } from "@shared/progress";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
import { DreamPicker } from "./DreamPicker";

const profile: Profile = {
  id: "kid-1",
  name: "Ada",
  age: 8,
  interests: [],
  sessions: { kid: "kid-session", parent: "parent-session" },
  createdAt: "2026-01-01T00:00:00.000Z",
  dreamHistory: [],
};

function makeDream(difficulty: number, overrides: Partial<Dream> = {}): Dream {
  return {
    id: "pet-page",
    title_parent: "Pet page",
    title_kid: "pet page",
    summary_kid: "a page about your pet",
    categories: ["personal"],
    interest_tags: [],
    requires: ["html-doc-shell"],
    style_hints: [],
    emoji: "🐶",
    ...overrides,
    difficulty,
  } as unknown as Dream;
}

describe("DreamPicker difficulty", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const dream = makeDream(3);
    const graph: KnowledgeGraph = { nodes: [], byId: {} };
    useGraphStore.setState({
      graph,
      library: { dreams: [dream], byId: { [dream.id]: dream } },
      graphErrors: [],
      dreamErrors: [],
      status: "ready",
      error: null,
      load: vi.fn(async () => {}),
    });
    useProfileStore.setState({
      profiles: [profile],
      status: "ready",
      error: null,
      activeProfileId: profile.id,
      setCurrentDream: vi.fn(async () => profile),
    });
    useProgressStore.setState({
      progress: emptyProgress(),
      profileId: profile.id,
      status: "ready",
      error: null,
      updateError: null,
      load: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useProgressStore.getState().reset();
  });

  it("shows the five-scale bit rating with mascot icons", async () => {
    await act(async () => {
      root.render(<DreamPicker profile={profile} />);
    });

    expect(host.textContent).toContain("3 bits");
    const icons = host.querySelectorAll<HTMLImageElement>(".hb-dream-difficulty-icon");
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon.alt).toBe("");
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("pins playground first with a not-sure-yet cue", async () => {
    const playground = makeDream(1, {
      id: "playground",
      mode: "conversation",
      title_parent: "Playground",
      title_kid: "playground",
      summary_kid: "chat with Bit about anything you are curious about",
      categories: ["creative"],
      requires: [],
      emoji: "💬",
    });
    const petPage = makeDream(1, { id: "pet-page", title_kid: "pet page" });
    const snake = makeDream(2, {
      id: "snake",
      title_kid: "snake game",
      categories: ["arcade"],
      requires: ["canvas-setup"],
    });
    useGraphStore.setState({
      library: {
        dreams: [petPage, snake, playground],
        byId: { [petPage.id]: petPage, [snake.id]: snake, [playground.id]: playground },
      },
    });

    await act(async () => {
      root.render(<DreamPicker profile={profile} />);
    });

    const titles = Array.from(host.querySelectorAll(".hb-dream-title")).map((el) =>
      el.textContent?.trim(),
    );
    expect(titles[0]).toBe("Playground.");
    expect(host.textContent).toContain("Not sure yet?");
    expect(host.textContent).toContain("talk with Bit before picking a project");
  });
});
