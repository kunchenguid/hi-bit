// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConfigStore } from "../state/configStore";
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

describe("ProfileGate mascot", () => {
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
    useConfigStore.setState({
      config: null,
      status: "ready",
      error: null,
      hasParentPin: true,
      verifyParentPin: vi.fn(async () => true),
      setParentPin: vi.fn(async () => {}),
    });
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
    useConfigStore.setState({
      config: null,
      status: "idle",
      error: null,
      hasParentPin: false,
    });
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

  it("unlocks parent mode from the profile picker before choosing a learner to manage", async () => {
    await act(async () => {
      root.render(<ProfileGate />);
    });

    const grownUpsButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "For grown-ups",
    );
    expect(grownUpsButton).toBeDefined();

    await act(async () => {
      grownUpsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const pinInput = host.querySelector<HTMLInputElement>('input[type="password"]');
    expect(pinInput).not.toBeNull();

    await act(async () => {
      if (!pinInput) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(pinInput, "1234");
      pinInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector("form")
        ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });

    expect(host.textContent).toContain("Pick a learner to manage.");
    expect(host.textContent).toContain("Ada");
    expect(host.textContent).toContain("Open parent mode");
  });
});
