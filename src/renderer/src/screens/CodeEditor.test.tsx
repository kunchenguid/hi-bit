// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { emptyProgress } from "@shared/progress";
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
      writeProjectFile: vi.fn(async () => undefined),
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

  it("saves every dirty buffer before running the preview", async () => {
    const writeProjectFile = vi.fn(async () => undefined);
    window.hibit.writeProjectFile = writeProjectFile;
    useProjectsStore.setState({
      activeFileName: "style.css",
      buffers: [
        {
          name: "index.html",
          savedContent: "<h1>Saved</h1>",
          content: "<h1>Edited</h1>",
        },
        {
          name: "style.css",
          savedContent: "body { color: red; }",
          content: "body { color: red; }",
        },
      ],
    });

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

    expect(writeProjectFile).toHaveBeenCalledWith(
      profile.id,
      profile.currentDreamId,
      "index.html",
      "<h1>Edited</h1>",
    );
  });

  it("shows a matching See my code button in page mode", async () => {
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

    const codeButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "See my code",
    );
    expect(codeButton).toBeDefined();

    await act(async () => {
      codeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editorPane = host.querySelector('[aria-label="Code editor"]');
    const previewPane = host.querySelector('[aria-label="Live preview"]');

    expect(editorPane?.hasAttribute("hidden")).toBe(false);
    expect((editorPane as HTMLElement | null)?.style.display).toBe("");
    expect(previewPane?.hasAttribute("hidden")).toBe(true);
    expect((previewPane as HTMLElement | null)?.style.display).toBe("none");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Code");
  });

  it("records run-and-preview as seen when the kid clicks See my page", async () => {
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
      "saw_it",
      "Clicked See my page and saw the live preview.",
    );
  });

  it("tells Bit when the kid clicks See my page", async () => {
    const sendLearnerActivity = vi.fn(async () => null);
    useChatStore.setState({ sendLearnerActivity });

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

    expect(sendLearnerActivity).toHaveBeenCalledWith(profile.id, { type: "preview.opened" });
  });

  it("does not downgrade stronger run-and-preview progress", async () => {
    const updateStatus = vi.fn(async () => {});
    useProgressStore.setState({
      updateStatus,
      progress: {
        ...emptyProgress(),
        knowledgePoints: {
          "run-and-preview": {
            status: "did_unprompted",
            firstSeenAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    });

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

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("does not unskip skipped run-and-preview progress", async () => {
    const updateStatus = vi.fn(async () => {});
    useProgressStore.setState({
      updateStatus,
      progress: {
        ...emptyProgress(),
        knowledgePoints: {
          "run-and-preview": {
            status: "saw_it",
            firstSeenAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            skipped: true,
          },
        },
      },
    });

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

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("does not record run-and-preview against a different loaded profile", async () => {
    const updateStatus = vi.fn(async () => {});
    useProgressStore.setState({
      profileId: "kid-2",
      status: "ready",
      progress: emptyProgress(),
      updateStatus,
    });

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

    expect(updateStatus).not.toHaveBeenCalled();
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

  it("tells Bit when the kid switches to Split view", async () => {
    const sendLearnerActivity = vi.fn(async () => null);
    useChatStore.setState({ sendLearnerActivity });

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

    expect(sendLearnerActivity).toHaveBeenCalledWith(profile.id, {
      type: "workspace.view.split",
    });
  });

  it("completes show-me-around before telling Bit the kid switched to Split view", async () => {
    let finishProgressUpdate: (() => void) | null = null;
    const updateStatus = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishProgressUpdate = resolve;
        }),
    );
    const sendLearnerActivity = vi.fn(async () => null);
    useProgressStore.setState({
      updateStatus,
      progress: {
        ...emptyProgress(),
        knowledgePoints: {
          "run-and-preview": {
            status: "saw_it",
            firstSeenAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    });
    useChatStore.setState({ sendLearnerActivity });

    await act(async () => {
      root.render(<CodeEditor profile={{ ...profile, currentDreamId: "show-me-around" }} docked />);
    });

    const splitButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Split",
    );
    if (!splitButton) throw new Error("Split button was not rendered");

    await act(async () => {
      splitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateStatus).toHaveBeenCalledWith(
      "run-and-preview",
      "did_with_help",
      "Completed the show me around tour by opening the editor, viewing the page, and using Split view.",
    );
    expect(sendLearnerActivity).not.toHaveBeenCalled();

    await act(async () => {
      finishProgressUpdate?.();
    });

    expect(sendLearnerActivity).toHaveBeenCalledWith(profile.id, {
      type: "workspace.view.split",
    });
  });

  it("does not complete run-and-preview from Split outside show-me-around", async () => {
    const updateStatus = vi.fn(async () => {});
    const sendLearnerActivity = vi.fn(async () => null);
    useProgressStore.setState({
      updateStatus,
      progress: {
        ...emptyProgress(),
        knowledgePoints: {
          "run-and-preview": {
            status: "saw_it",
            firstSeenAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    });
    useChatStore.setState({ sendLearnerActivity });

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

    expect(updateStatus).not.toHaveBeenCalled();
    expect(sendLearnerActivity).toHaveBeenCalledWith(profile.id, {
      type: "workspace.view.split",
    });
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

  it("saves a dirty file before showing the page", async () => {
    useProjectsStore.getState().updateBuffer("index.html", "<h1>Ada</h1>");

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

    expect(window.hibit.writeProjectFile).toHaveBeenCalledWith(
      profile.id,
      profile.currentDreamId,
      "index.html",
      "<h1>Ada</h1>",
    );
    expect(host.querySelector('[aria-label="unsaved changes"]')).toBeNull();
    expect(host.textContent).toContain("All saved");
  });

  it("shows 'Code formatted and saved' after clicking Save, and reverts to 'All saved' when the user edits again", async () => {
    useProjectsStore.getState().updateBuffer("index.html", "<h1>Ada</h1>");

    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    expect(host.textContent).not.toContain("Code formatted and saved");

    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Save",
    );
    if (!saveButton) throw new Error("Save button was not rendered");

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Code formatted and saved");
    expect(host.textContent).not.toMatch(/✓\s*All saved/);

    await act(async () => {
      useProjectsStore.getState().updateBuffer("index.html", "<h1>Ada Lovelace</h1>");
    });

    await act(async () => {
      const saveAgain = Array.from(host.querySelectorAll("button")).find(
        (el) => el.textContent === "Save",
      );
      if (!saveAgain) throw new Error("Save button did not reappear after editing");
      saveAgain.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Code formatted and saved");
  });

  it("tells Bit a saved preview is hidden when saving from Code view", async () => {
    const sendSystemPrompt = vi.fn(async () => null);
    useChatStore.setState({ sendSystemPrompt });
    useProjectsStore.getState().updateBuffer("index.html", "<h1>Ada</h1>");

    await act(async () => {
      root.render(<CodeEditor profile={profile} docked />);
    });

    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Save",
    );
    if (!saveButton) throw new Error("Save button was not rendered");

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(sendSystemPrompt).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({
        prompt: expect.stringContaining("the preview is hidden in Code view"),
      }),
    );
    expect(sendSystemPrompt).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({
        prompt: expect.not.stringContaining(
          "Do not ask the kid to press See my page just to see this saved change",
        ),
      }),
    );
  });

  it("tells Bit not to ask for See my page when saving from Split view", async () => {
    const sendSystemPrompt = vi.fn(async () => null);
    useChatStore.setState({ sendSystemPrompt });

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

    await act(async () => {
      useProjectsStore.getState().updateBuffer("index.html", "<h1>Ada</h1>");
    });

    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Save",
    );
    if (!saveButton) throw new Error("Save button was not rendered");

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(sendSystemPrompt).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Do not ask the kid to press See my page just to see this saved change",
        ),
      }),
    );
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
