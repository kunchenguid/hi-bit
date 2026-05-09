// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppModeStore } from "../state/appModeStore";
import { useConfigStore } from "../state/configStore";
import { useProfileStore } from "../state/profileStore";
import { ParentShell } from "./ParentShell";

vi.mock("./ParentHome", () => ({
  ParentHome: ({
    profile,
    onLock,
    onSwitchProfile,
  }: {
    profile: Profile;
    onLock: () => void;
    onSwitchProfile?: () => void;
  }) => (
    <main>
      <h1>{profile.name}'s parent home</h1>
      <button type="button" onClick={onSwitchProfile}>
        Switch profile
      </button>
      <button type="button" onClick={onLock}>
        Exit parent mode
      </button>
    </main>
  ),
}));

vi.mock("./HarnessSetup", () => ({
  HarnessSetup: ({ onDone }: { onDone: () => void }) => (
    <main>
      <h1>Pick your AI helper</h1>
      <button type="button" onClick={onDone}>
        Pretend agent picked
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
  dreamHistory: [],
};

describe("ParentShell", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    useAppModeStore.setState({ mode: "parent" });
    useProfileStore.setState({
      profiles: [profile],
      status: "ready",
      error: null,
      activeProfileId: null,
      loadProfiles: vi.fn(async () => {}),
      selectProfile: vi.fn(),
    });
    useConfigStore.setState({
      config: { version: 2, defaultAgent: "claude" },
      status: "ready",
      error: null,
      hasParentPin: true,
      verifyParentPin: vi.fn(async () => true),
      setParentPin: vi.fn(async () => {}),
      load: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useAppModeStore.setState({ mode: "kid" });
    useProfileStore.setState({
      profiles: [],
      status: "idle",
      error: null,
      activeProfileId: null,
    });
    useConfigStore.setState({
      config: null,
      status: "idle",
      error: null,
      hasParentPin: false,
    });
  });

  async function unlock(): Promise<void> {
    const pinInput = host.querySelector<HTMLInputElement>('input[type="password"]');
    expect(pinInput).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      valueSetter?.call(pinInput, "1234");
      pinInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector("form")
        ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("starts on the parent gate", async () => {
    await act(async () => {
      root.render(<ParentShell />);
    });
    expect(host.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("after unlock, shows the parent profile picker when no profile is being managed", async () => {
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();
    expect(host.textContent).toContain("Pick a learner to manage.");
    expect(host.textContent).toContain("Ada");
  });

  it("opens parent home for a chosen profile", async () => {
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();

    const choice = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Open parent mode"),
    );
    await act(async () => {
      choice?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.textContent).toContain("Ada's parent home");
  });

  it("Exit parent mode flips appMode back to kid", async () => {
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();

    const choice = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Open parent mode"),
    );
    await act(async () => {
      choice?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const exit = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Exit parent mode",
    );
    await act(async () => {
      exit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(useAppModeStore.getState().mode).toBe("kid");
  });

  it("Switch profile from parent home returns to the parent picker", async () => {
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();

    const choice = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Open parent mode"),
    );
    await act(async () => {
      choice?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const switchProfile = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Switch profile",
    );
    await act(async () => {
      switchProfile?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Pick a learner to manage.");
  });

  it("renders HarnessSetup when no defaultAgent is configured", async () => {
    useConfigStore.setState({ config: { version: 2 } });
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();
    expect(host.textContent).toContain("Pick your AI helper");
  });

  it("hides parent gate cancel when setup prerequisites force parent mode", async () => {
    useConfigStore.setState({ config: { version: 2 } });
    await act(async () => {
      root.render(<ParentShell />);
    });

    expect(host.textContent).toContain("Enter your parent PIN.");
    expect(host.textContent).not.toContain("Cancel");
  });

  it("on first run with no profiles, prompts the parent to add a learner", async () => {
    useProfileStore.setState({ profiles: [] });
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();
    expect(host.textContent).toContain("Add your first learner.");
    const add = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "+ Add a new learner",
    );
    expect(add).toBeDefined();
  });

  it("hides parent picker exit when no profiles force parent mode", async () => {
    useProfileStore.setState({ profiles: [] });
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();

    expect(host.textContent).toContain("Add your first learner.");
    expect(host.textContent).not.toContain("Exit parent mode");
  });

  it("prompts for the first learner before agent setup on fresh installs", async () => {
    useConfigStore.setState({ config: { version: 2 } });
    useProfileStore.setState({ profiles: [] });
    await act(async () => {
      root.render(<ParentShell />);
    });
    await unlock();

    expect(host.textContent).toContain("Add your first learner.");
    expect(host.textContent).not.toContain("Pick your AI helper");
  });
});
