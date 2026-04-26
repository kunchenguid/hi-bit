// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BIT_CURSOR_MARKER } from "../editor/cursorMarker";
import { useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProgressStore } from "../state/progressStore";
import { useProjectsStore } from "../state/projectsStore";
import { KidBuildWorkspace } from "./KidBuildWorkspace";

vi.mock("./CodeEditor", () => ({
  CodeEditor: ({
    cursorTarget,
  }: {
    cursorTarget?: { filename: string; position: number } | null;
  }) => (
    <div data-testid="cursor-target">
      {cursorTarget ? `${cursorTarget.filename}:${cursorTarget.position}` : "none"}
    </div>
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
  currentDreamId: "dream-1",
};

describe("KidBuildWorkspace cursor target", () => {
  let host: HTMLDivElement;
  let root: Root;
  let resolveMarker: (value: { ok: true; text: string }) => void;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    useChatStore.setState({
      messages: [
        {
          id: "bit-1",
          role: "bit",
          kind: "text",
          text: "Replace the heading.",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
      status: "idle",
      hydrateStatus: "ready",
      hydratedSessionId: profile.sessions.kid,
      streamingText: null,
    });
    useGraphStore.setState({ status: "ready", graph: null, library: null });
    useProgressStore.setState({ status: "ready", profileId: profile.id, progress: null });
    useProjectsStore.setState({
      profileId: profile.id,
      slug: profile.currentDreamId ?? null,
      status: "ready",
      error: null,
      activeFileName: "index.html",
      buffers: [
        {
          name: "index.html",
          savedContent: "<main><h1>Old</h1></main>",
          content: "<main><h1>Old</h1></main>",
        },
      ],
      subscriptionId: null,
    });

    window.hibit = {
      onBitDelta: () => () => {},
      requestCursorMarker: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveMarker = resolve;
          }),
      ),
    } as unknown as typeof window.hibit;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useChatStore.getState().reset();
    useGraphStore.setState({
      graph: null,
      library: null,
      graphErrors: [],
      dreamErrors: [],
      status: "idle",
      error: null,
    });
    useProgressStore.getState().reset();
    useProjectsStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("does not apply a cursor marker after the active buffer changes", async () => {
    await act(async () => {
      root.render(
        <KidBuildWorkspace
          profile={profile}
          onEnterParentMode={() => {}}
          onSwitchDream={() => {}}
          onOpenProjects={() => {}}
        />,
      );
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Show me where",
    );
    if (!button) throw new Error("Show me where button was not rendered");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    useProjectsStore.getState().updateBuffer("index.html", "<main><h1>New</h1></main>");

    await act(async () => {
      resolveMarker({
        ok: true,
        text: JSON.stringify({
          surrounding_content_with_marker: `<main>${BIT_CURSOR_MARKER}<h1>Old</h1></main>`,
        }),
      });
    });

    expect(host.querySelector('[data-testid="cursor-target"]')?.textContent).toBe("none");
  });

  it("returns to idle when the revealed editor has no active buffer", async () => {
    useProjectsStore.setState({
      activeFileName: "index.html",
      buffers: [],
    });

    await act(async () => {
      root.render(
        <KidBuildWorkspace
          profile={profile}
          onEnterParentMode={() => {}}
          onSwitchDream={() => {}}
          onOpenProjects={() => {}}
        />,
      );
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Show me where",
    );
    if (!button) throw new Error("Show me where button was not rendered");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const nextButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Show me where",
    );
    expect(nextButton).toBeTruthy();
    expect(host.textContent).toContain("Open a file first, then Bit can point to the spot.");
    expect(window.hibit.requestCursorMarker).not.toHaveBeenCalled();
  });
});
