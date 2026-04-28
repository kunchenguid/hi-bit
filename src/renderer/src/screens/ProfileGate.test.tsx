// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
