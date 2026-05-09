// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppModeStore } from "../state/appModeStore";
import { useProfileStore } from "../state/profileStore";
import { ProfileGate } from "./ProfileGate";

const profile: Profile = {
  id: "kid-1",
  name: "Ada",
  age: 8,
  interests: [],
  sessions: { kid: "kid-session", parent: "parent-session" },
  createdAt: "2026-01-01T00:00:00.000Z",
  dreamHistory: [],
};

describe("ProfileGate", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    useProfileStore.setState({
      profiles: [profile],
      status: "ready",
      error: null,
      activeProfileId: null,
      loadProfiles: vi.fn(async () => {}),
      selectProfile: vi.fn(),
    });
    useAppModeStore.setState({ mode: "kid" });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useProfileStore.setState({
      profiles: [],
      status: "idle",
      error: null,
      activeProfileId: null,
    });
    useAppModeStore.setState({ mode: "kid" });
  });

  it("shows the mascot on the profile picker", async () => {
    await act(async () => {
      root.render(<ProfileGate />);
    });

    const mascot = host.querySelector<HTMLImageElement>(".hb-gate-mascot");

    expect(mascot).not.toBeNull();
    expect(mascot?.getAttribute("aria-hidden")).toBe("true");
    expect(mascot?.alt).toBe("");
  });

  it("shows a grown-ups entry point on the profile picker", async () => {
    await act(async () => {
      root.render(<ProfileGate />);
    });

    const buttons = Array.from(host.querySelectorAll("button"));
    expect(buttons.some((button) => button.textContent?.trim() === "For grown-ups")).toBe(true);
  });

  it("flips appMode to parent when For grown-ups is clicked", async () => {
    await act(async () => {
      root.render(<ProfileGate />);
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "For grown-ups",
    );
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(useAppModeStore.getState().mode).toBe("parent");
  });

  it("selects a profile when its card is clicked", async () => {
    const selectProfile = vi.fn();
    useProfileStore.setState({ selectProfile });

    await act(async () => {
      root.render(<ProfileGate />);
    });

    const profileCard = host.querySelector<HTMLButtonElement>(".hb-profile-card");
    await act(async () => {
      profileCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(selectProfile).toHaveBeenCalledWith("kid-1");
  });
});
