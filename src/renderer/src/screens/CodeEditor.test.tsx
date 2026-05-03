// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeMirrorCursorMarker } from "../editor/CodeMirrorEditor";
import { useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProgressStore } from "../state/progressStore";
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
    useProgressStore.setState({ profileId: profile.id, status: "ready", progress: null });
    window.hibit = {
      subscribeProjectFiles: vi.fn(async () => ({ id: "sub-1", close: vi.fn() })),
      openProjectFolder: vi.fn(async () => ({ ok: true, path: "/tmp/project" })),
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
    useProgressStore.getState().reset();
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

  it("starts docked workspaces in code mode", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const editorPane = host.querySelector('[aria-label="Code editor"]');
    const previewPane = host.querySelector('[aria-label="Live preview"]');

    expect(editorPane?.hasAttribute("hidden")).toBe(false);
    expect((editorPane as HTMLElement | null)?.style.display).toBe("");
    expect(previewPane?.hasAttribute("hidden")).toBe(true);
    expect((previewPane as HTMLElement | null)?.style.display).toBe("none");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Code");
  });

  it("switches docked workspaces to page mode after running the preview", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const runButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "See my page",
    );
    if (!runButton) throw new Error("See my page button was not rendered");

    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editorPane = host.querySelector('[aria-label="Code editor"]');
    const previewPane = host.querySelector('[aria-label="Live preview"]');

    expect(editorPane?.hasAttribute("hidden")).toBe(true);
    expect((editorPane as HTMLElement | null)?.style.display).toBe("none");
    expect(previewPane?.hasAttribute("hidden")).toBe(false);
    expect((previewPane as HTMLElement | null)?.style.display).toBe("");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Page");
  });

  it("records run-and-preview progress when the kid clicks See my page", async () => {
    const updateStatus = vi.fn(async () => {});
    useProgressStore.setState({ updateStatus });

    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const runButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "See my page",
    );
    if (!runButton) throw new Error("See my page button was not rendered");

    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateStatus).toHaveBeenCalledWith(
      "run-and-preview",
      "did_with_help",
      "Clicked See my page and viewed the live preview.",
    );
  });

  it("reveals the editor when a cursor target arrives in page mode", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const runButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "See my page",
    );
    if (!runButton) throw new Error("See my page button was not rendered");

    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(
        <CodeEditor
          profile={profile}
          docked
          cursorTarget={{ filename: "index.html", position: 4, requestId: 456 }}
        />,
      );
    });

    const editorPane = host.querySelector('[aria-label="Code editor"]');
    const previewPane = host.querySelector('[aria-label="Live preview"]');

    expect(editorPane?.hasAttribute("hidden")).toBe(false);
    expect((editorPane as HTMLElement | null)?.style.display).toBe("");
    expect(previewPane?.hasAttribute("hidden")).toBe(false);
    expect((previewPane as HTMLElement | null)?.style.display).toBe("");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Split");
  });

  it("can show editor and preview together in split mode", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const splitButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Split",
    );
    if (!splitButton) throw new Error("Split button was not rendered");

    await act(async () => {
      splitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editorPane = host.querySelector('[aria-label="Code editor"]');
    const previewPane = host.querySelector('[aria-label="Live preview"]');

    expect(editorPane?.hasAttribute("hidden")).toBe(false);
    expect((editorPane as HTMLElement | null)?.style.display).toBe("");
    expect(previewPane?.hasAttribute("hidden")).toBe(false);
    expect((previewPane as HTMLElement | null)?.style.display).toBe("");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Split");
  });

  it("keeps Open folder with the file actions instead of the bottom toolbar", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const fileActions = host.querySelector(".hb-editor-file-actions");
    const toolbar = host.querySelector(".hb-editor-toolbar");

    expect(fileActions?.textContent).toContain("Open folder");
    expect(toolbar?.textContent).not.toContain("Open folder");
  });

  it("refreshes the live preview from the latest file content", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const runButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "See my page",
    );
    if (!runButton) throw new Error("See my page button was not rendered");

    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      useProjectsStore.getState().updateBuffer("index.html", "<h1>Changed</h1>");
    });

    const refreshButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Refresh",
    );
    if (!refreshButton) throw new Error("Refresh button was not rendered");

    await act(async () => {
      refreshButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const iframe = host.querySelector("iframe");
    expect(iframe?.getAttribute("srcdoc")).toContain("Changed");
  });

  it("reloads the iframe on Refresh even when no content changed", async () => {
    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const runButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "See my page",
    );
    if (!runButton) throw new Error("See my page button was not rendered");

    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const iframeBefore = host.querySelector("iframe");
    if (!iframeBefore) throw new Error("Live preview iframe was not rendered");

    const refreshButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Refresh",
    );
    if (!refreshButton) throw new Error("Refresh button was not rendered");

    await act(async () => {
      refreshButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const iframeAfter = host.querySelector("iframe");
    expect(iframeAfter).not.toBe(iframeBefore);
  });
});
