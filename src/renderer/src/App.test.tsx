// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useAppModeStore } from "./state/appModeStore";
import { useConfigStore } from "./state/configStore";
import { useProfileStore } from "./state/profileStore";

vi.mock("./screens/KidWorkspace", () => ({
  KidWorkspace: () => <main>Kid workspace</main>,
}));

vi.mock("./screens/ParentShell", () => ({
  ParentShell: () => <main>Parent shell</main>,
}));

vi.mock("./screens/ProfileGate", () => ({
  ProfileGate: () => <main>Profile gate</main>,
}));

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    useAppModeStore.setState({ mode: "kid" });
    useConfigStore.setState({
      config: { version: 2, defaultAgent: "claude" },
      status: "ready",
      error: null,
      hasParentPin: false,
      load: vi.fn(async () => {}),
    });
    useProfileStore.setState({
      profiles: [],
      status: "ready",
      error: null,
      activeProfileId: null,
      loadProfiles: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useAppModeStore.setState({ mode: "kid" });
    useConfigStore.setState({
      config: null,
      status: "idle",
      error: null,
      hasParentPin: false,
    });
    useProfileStore.setState({
      profiles: [],
      status: "idle",
      error: null,
      activeProfileId: null,
    });
  });

  it("routes to parent shell when config fails during bootstrap", async () => {
    useConfigStore.setState({ config: null, status: "error", error: "Config failed" });

    await act(async () => {
      root.render(<App />);
    });

    expect(host.textContent).toContain("Parent shell");
    expect(host.textContent).not.toContain("Waking Bit up...");
  });

  it("routes to profile gate when profile loading fails during bootstrap", async () => {
    useProfileStore.setState({ status: "error", error: "Profiles failed" });

    await act(async () => {
      root.render(<App />);
    });

    expect(host.textContent).toContain("Profile gate");
    expect(host.textContent).not.toContain("Waking Bit up...");
  });
});
