// @vitest-environment jsdom
/// <reference types="node" />

import type { AuthStatus } from "@shared/auth";
import type { ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./ChatWorkspace";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const profile: ProfileSummary = {
  schemaVersion: 1,
  id: "profile-1",
  name: "Test",
  age: 9,
  interests: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  unlockedConcepts: [],
  pendingConceptReveals: [],
  unlockStats: { buildsDelegated: 0, openedActivities: false },
};

const authStatus: AuthStatus = {
  authenticated: true,
  accountId: "bd596edf-af40-47f6-b10f-a7f2ffdb4ab3",
  storage: { path: "/tmp/codex.json", encrypted: true },
};

function makeCreation(id: string, title: string): ProjectSummary {
  return {
    schemaVersion: 1,
    id,
    profileId: "profile-1",
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderWorkspace(
  host: HTMLElement,
  overrides: {
    authStatus?: AuthStatus | null;
    creations?: ProjectSummary[];
    playableProjectIds?: string[];
    onPlayPreview?: (projectId: string) => void;
  } = {},
): void {
  const root = createRoot(host);
  act(() =>
    root.render(
      <ChatWorkspace
        authStatus={overrides.authStatus === undefined ? authStatus : overrides.authStatus}
        profile={profile}
        messages={[]}
        activity={[]}
        showActivity={false}
        draft=""
        running={false}
        activeTurn={null}
        busy={false}
        error={null}
        previews={[]}
        playableProjectIds={overrides.playableProjectIds ?? []}
        creations={overrides.creations ?? []}
        activePreview={null}
        reloadSignal={0}
        onDraftChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onOpenFolder={vi.fn()}
        onSwitchProfile={vi.fn()}
        onUpdateProfile={vi.fn(async () => {})}
        onShowActivity={vi.fn()}
        onHideActivity={vi.fn()}
        onPlayPreview={overrides.onPlayPreview ?? vi.fn()}
        onClosePreview={vi.fn()}
        onOpenPreviewExternal={vi.fn()}
        onClearPreviewCache={vi.fn(async () => {})}
      />,
    ),
  );
  (host as unknown as { __root?: Root }).__root = root;
}

describe("ChatWorkspace header", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    const root = (host as unknown as { __root?: Root }).__root;
    if (root) act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("greets the builder with a single heading and no redundant chrome", () => {
    renderWorkspace(host);
    const header = host.querySelector(".hb-workspace-header");
    expect(header).not.toBeNull();

    // The greeting is the one line of header copy.
    const heading = header?.querySelector("h1");
    expect(heading?.textContent).toBe("Hi Test - what should we build?");

    // The "Hi-Bit" pixel eyebrow is gone (the window title already says it).
    expect(header?.querySelector(".t-pixel")).toBeNull();

    // The "Tell Bit your idea." subtitle is gone (the empty state already prompts).
    expect(header?.textContent).not.toContain("Tell Bit your idea");
  });

  it("tucks the Codex provider status inside the Grown-up menu, not the header copy", () => {
    renderWorkspace(host);
    const header = host.querySelector(".hb-workspace-header");
    const menu = header?.querySelector(".hb-parent-menu-popover");
    expect(menu).not.toBeNull();

    // Provider plumbing (including the account id) lives in the grown-up menu.
    expect(menu?.textContent).toContain("Codex provider connected");
    expect(menu?.textContent).toContain("bd596edf-af40-47f6-b10f-a7f2ffdb4ab3");

    // It is not sitting in the always-visible greeting row.
    const greeting = header?.querySelector("h1");
    expect(greeting?.textContent).not.toContain("Codex provider connected");
  });

  it("still reports the provider when no account id is known", () => {
    renderWorkspace(host, { authStatus: { ...authStatus, accountId: undefined } });
    const menu = host.querySelector(".hb-parent-menu-popover");
    expect(menu?.textContent).toContain("Codex provider connected");
  });
});

describe("ChatWorkspace creation picker", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    const root = (host as unknown as { __root?: Root }).__root;
    if (root) act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  function findButton(text: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(text),
    );
  }

  it("opens the picker from the status bar once there is more than one creation", () => {
    renderWorkspace(host, {
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
    });

    expect(host.querySelector(".hb-creation-picker")).toBeNull();

    const seeCreations = findButton("Your creations");
    expect(seeCreations).toBeDefined();

    act(() => seeCreations?.click());

    const picker = host.querySelector(".hb-creation-picker");
    expect(picker).not.toBeNull();
    expect(picker?.textContent).toContain("Cat Jump");
    expect(picker?.textContent).toContain("Star Maze");
  });

  it("plays the chosen creation from the picker", () => {
    const onPlayPreview = vi.fn();
    renderWorkspace(host, {
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
      playableProjectIds: ["p2"],
      onPlayPreview,
    });

    act(() => findButton("Your creations")?.click());
    act(() => findButton("Star Maze")?.click());

    expect(onPlayPreview).toHaveBeenCalledWith("p2");
    // Choosing closes the picker.
    expect(host.querySelector(".hb-creation-picker")).toBeNull();
  });

  it("keeps creations without previews from playing in the picker", () => {
    const onPlayPreview = vi.fn();
    renderWorkspace(host, {
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
      playableProjectIds: ["p2"],
      onPlayPreview,
    });

    act(() => findButton("Your creations")?.click());
    const catJump = findButton("Cat Jump");

    expect(catJump?.disabled).toBe(true);
    act(() => catJump?.click());

    expect(onPlayPreview).not.toHaveBeenCalled();
    expect(host.querySelector(".hb-creation-picker")).not.toBeNull();
  });
});
