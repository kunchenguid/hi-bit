// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeMirrorCursorMarker } from "../editor/CodeMirrorEditor";
import { useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProjectsStore } from "../state/projectsStore";
import { CodeEditor } from "./CodeEditor";

const renderedMarkers: Array<CodeMirrorCursorMarker | null | undefined> = [];

vi.mock("../editor/CodeMirrorEditor", () => ({
  CodeMirrorEditor: ({ cursorMarker }: { cursorMarker?: CodeMirrorCursorMarker | null }) => {
    renderedMarkers.push(cursorMarker);
    return <div data-testid="code-mirror" />;
  },
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

describe("CodeEditor cursor marker", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    renderedMarkers.length = 0;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    useProjectsStore.setState({
      profileId: profile.id,
      slug: profile.currentDreamId ?? null,
      status: "ready",
      error: null,
      activeFileName: "index.html",
      buffers: [
        {
          name: "index.html",
          savedContent: "<h1>Hello</h1>",
          content: "<h1>Hello</h1>",
        },
      ],
      subscriptionId: null,
    });
    useGraphStore.setState({ status: "ready", graph: null, library: null });
    window.hibit = {
      subscribeProjectFiles: vi.fn(async () => ({ id: "sub-1", close: vi.fn() })),
    } as unknown as typeof window.hibit;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useProjectsStore.getState().reset();
    useGraphStore.setState({
      graph: null,
      library: null,
      graphErrors: [],
      dreamErrors: [],
      status: "idle",
      error: null,
    });
    useChatStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("keeps the marker prop stable across equivalent rerenders", async () => {
    const cursorTarget = { filename: "index.html", position: 4, requestId: 123 };

    await act(async () => {
      root.render(<CodeEditor profile={profile} cursorTarget={cursorTarget} />);
    });
    const firstMarker = renderedMarkers.at(-1);

    await act(async () => {
      root.render(<CodeEditor profile={profile} cursorTarget={cursorTarget} />);
    });

    expect(renderedMarkers.at(-1)).toBe(firstMarker);
  });
});
