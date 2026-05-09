// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppModeStore } from "../state/appModeStore";
import { KidWorkspace } from "./KidWorkspace";

vi.mock("./DreamPicker", () => ({
  DreamPicker: ({ onPicked }: { onPicked?: () => void }) => (
    <main>
      <h1>Dream picker</h1>
      <button type="button" onClick={onPicked}>
        Pick dream
      </button>
    </main>
  ),
}));

vi.mock("./KidBuildWorkspace", () => ({
  KidBuildWorkspace: () => <main>Build workspace</main>,
}));

vi.mock("./KidChat", () => ({
  KidChat: () => <main>Kid chat</main>,
}));

vi.mock("./KidProjects", () => ({
  KidProjects: ({ onOpened }: { onOpened?: () => void }) => (
    <main>
      <h1>Kid projects</h1>
      <button type="button" onClick={onOpened}>
        Open project
      </button>
    </main>
  ),
}));

const profile: Profile = {
  id: "kid-1",
  name: "Ada",
  age: 8,
  interests: [],
  sessions: { kid: "kid-session", parent: "parent-session" },
  createdAt: "2026-01-01T00:00:00.000Z",
  currentDreamId: "dream-1",
  dreamHistory: [],
};

describe("KidWorkspace", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    useAppModeStore.setState({ mode: "kid" });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useAppModeStore.setState({ mode: "kid" });
  });

  function clickButton(label: string): void {
    const button = Array.from(host.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(label),
    );
    if (!button) throw new Error(`Button not found: ${label}`);
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("starts in the build workspace when a dream is active", () => {
    act(() => {
      root.render(<KidWorkspace profile={profile} />);
    });

    expect(host.textContent).toContain("Build workspace");
  });

  it("navigates between shell tabs and returns home after opening content", () => {
    act(() => {
      root.render(<KidWorkspace profile={profile} />);
    });

    clickButton("Switch dream");
    expect(host.textContent).toContain("Dream picker");

    clickButton("Pick dream");
    expect(host.textContent).toContain("Build workspace");

    clickButton("My projects");
    expect(host.textContent).toContain("Kid projects");

    clickButton("Open project");
    expect(host.textContent).toContain("Build workspace");
  });

  it("enters parent mode from the shell", () => {
    act(() => {
      root.render(<KidWorkspace profile={profile} />);
    });

    clickButton("For grown-ups");

    expect(useAppModeStore.getState().mode).toBe("parent");
  });

  it("starts at the picker when no dream is active", () => {
    act(() => {
      root.render(<KidWorkspace profile={{ ...profile, currentDreamId: undefined }} />);
    });

    expect(host.textContent).toContain("Dream picker");
  });
});
