// @vitest-environment jsdom
/// <reference types="node" />

import type { CreationActivity } from "@shared/chat";
import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
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
  skillMastery: {},
  roadmap: [],
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
    creations?: ProjectSummary[];
    activity?: CreationActivity[];
    showActivity?: boolean;
    playableProjectIds?: string[];
    onPlayPreview?: (projectId: string) => void;
    onShowActivity?: () => void;
    onOpenFolder?: () => void;
    onSwitchProfile?: () => void;
    onUpdateProfile?: (settings: ProfileSettingsInput) => Promise<void>;
    onResetConversation?: () => Promise<void>;
  } = {},
): void {
  const root = createRoot(host);
  act(() =>
    root.render(
      <ChatWorkspace
        profile={profile}
        messages={[]}
        activity={overrides.activity ?? []}
        showActivity={overrides.showActivity ?? false}
        draft=""
        draftImage={null}
        voiceSupported={false}
        running={false}
        activeTurn={null}
        busy={false}
        error={null}
        previews={[]}
        playableProjectIds={overrides.playableProjectIds ?? []}
        creations={overrides.creations ?? []}
        browserState={{ tabs: [], activeTabId: null }}
        reloadSignal={0}
        reloadProjectId={null}
        onDraftChange={vi.fn()}
        onAttachImage={vi.fn()}
        onClearImage={vi.fn()}
        onVoiceText={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onOpenFolder={overrides.onOpenFolder ?? vi.fn()}
        onSwitchProfile={overrides.onSwitchProfile ?? vi.fn()}
        onUpdateProfile={overrides.onUpdateProfile ?? vi.fn(async () => {})}
        onResetConversation={overrides.onResetConversation ?? vi.fn(async () => {})}
        thinkingSpeed="medium"
        onChangeThinkingSpeed={vi.fn()}
        onShowActivity={overrides.onShowActivity ?? vi.fn()}
        onHideActivity={vi.fn()}
        onPlayPreview={overrides.onPlayPreview ?? vi.fn()}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onReportTabLoaded={vi.fn()}
        onOpenPreviewExternal={vi.fn()}
        onClearPreviewCache={vi.fn(async () => {})}
      />,
    ),
  );
  (host as unknown as { __root?: Root }).__root = root;
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });
}

function installWindowApi({
  updateAvailable = false,
  progressGet = vi.fn(async () => null),
}: {
  updateAvailable?: boolean;
  progressGet?: ReturnType<typeof vi.fn>;
} = {}) {
  Object.defineProperty(window, "hibit", {
    configurable: true,
    value: {
      app: {
        info: vi.fn(async () => ({
          version: "0.0.2",
          platform: "darwin",
          userDataDir: "/tmp/userData",
          hiBitDir: "/tmp/userData/.hi-bit",
        })),
        getUpdateStatus: vi.fn(async () => ({
          currentVersion: "0.0.2",
          latestVersion: updateAvailable ? "0.0.3" : null,
          updateAvailable,
          releaseUrl: updateAvailable
            ? "https://github.com/kunchenguid/hi-bit/releases/tag/v0.0.3"
            : null,
        })),
        openReleasePage: vi.fn(async () => {}),
      },
      progress: { get: progressGet },
    },
  });
  return { progressGet };
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
    (window as unknown as { hibit?: unknown }).hibit = undefined;
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

  function findButton(text: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(text),
    );
  }

  it("keeps Settings free of technical provider plumbing", () => {
    renderWorkspace(host);
    // The kid-facing chrome no longer surfaces "Codex" or an account id anywhere.
    expect(host.textContent).not.toContain("Codex provider connected");
  });

  it("opens Settings as a tabbed overlay with a scrolling content panel", () => {
    renderWorkspace(host);

    expect(host.querySelector(".hb-parent-menu")).toBeNull();
    act(() => findButton("Settings")?.click());

    expect(host.querySelector('.hb-settings[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain("Back to building");
    expect(host.textContent).toContain("Details");
    expect(host.textContent).toContain("This account");
    expect(host.querySelector(".hb-settings-content")?.getAttribute("data-scroll-container")).toBe(
      "settings-content",
    );

    act(() => findButton("How Bit works")?.click());
    expect(host.querySelector("#hb-speed-slider")).not.toBeNull();

    act(() => findButton("About & updates")?.click());
    expect(host.textContent).toContain("Version");
  });

  it("shows update dots on the Settings button and About tab", async () => {
    installWindowApi({ updateAvailable: true });
    renderWorkspace(host);
    await flushAsyncWork();

    expect(findButton("Settings")?.querySelector(".hb-update-dot")).not.toBeNull();

    act(() => findButton("Settings")?.click());
    const aboutTab = findButton("About & updates");
    expect(aboutTab?.querySelector(".hb-settings-tab-dot")).not.toBeNull();

    act(() => aboutTab?.click());
    expect(host.textContent).toContain("Update available");
    expect(host.textContent).toContain("v0.0.3");
  });

  it("saves profile details from the inline Settings form", async () => {
    const onUpdateProfile = vi.fn(async () => {});
    renderWorkspace(host, { onUpdateProfile });

    act(() => findButton("Settings")?.click());
    const nameInput = host.querySelector<HTMLInputElement>('[name="profileName"]');
    expect(nameInput).not.toBeNull();
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(nameInput, "Test Builder");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      findButton("Save profile")?.click();
    });

    expect(onUpdateProfile).toHaveBeenCalledWith({
      name: "Test Builder",
      age: 9,
      interests: [],
      notes: null,
    });
  });

  it("keeps the Profile account action rows wired", () => {
    const onOpenFolder = vi.fn();
    const onSwitchProfile = vi.fn();
    renderWorkspace(host, { onOpenFolder, onSwitchProfile });

    act(() => findButton("Settings")?.click());
    act(() => findButton("Open creations folder")?.click());
    act(() => findButton("Switch profile")?.click());

    expect(onOpenFolder).toHaveBeenCalledOnce();
    expect(onSwitchProfile).toHaveBeenCalledOnce();
  });

  it("opens My progress as its own overlay and refreshes progress on open", async () => {
    const progressGet = vi.fn(async () => null);
    installWindowApi({ progressGet });
    renderWorkspace(host);
    await flushAsyncWork();
    const initialCalls = progressGet.mock.calls.length;

    act(() => findButton("My progress")?.click());
    await flushAsyncWork();

    expect(host.querySelector('.hb-progress-overlay[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain("My progress");
    expect(progressGet.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it("confirms before resetting the conversation from Settings", async () => {
    const onResetConversation = vi.fn(async () => {});
    renderWorkspace(host, { onResetConversation });

    act(() => findButton("Settings")?.click());
    act(() => findButton("Reset conversation")?.click());

    expect(onResetConversation).not.toHaveBeenCalled();
    expect(host.textContent).toContain("This cannot be undone");
    expect(host.textContent).toContain(
      "Kept: creations, saved game progress, pictures, and learning progress.",
    );

    await act(async () => {
      findButton("Yes, reset conversation")?.click();
    });

    expect(onResetConversation).toHaveBeenCalledOnce();
  });

  it("blocks conversation reset while a build is running", () => {
    const onResetConversation = vi.fn(async () => {});
    renderWorkspace(host, {
      onResetConversation,
      activity: [
        {
          projectId: "p1",
          title: "Cat Jump",
          status: "working",
          updatedAt: "2026-01-01T00:00:00.000Z",
          steps: [],
        },
      ],
    });

    act(() => findButton("Settings")?.click());
    act(() => findButton("Reset conversation")?.click());
    const confirm = findButton("Yes, reset conversation");

    expect(host.textContent).toContain(
      "Wait for the running build to finish before resetting the conversation.",
    );
    expect(confirm?.disabled).toBe(true);
    expect(onResetConversation).not.toHaveBeenCalled();
  });
});

describe("ChatWorkspace factory floor", () => {
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
    (window as unknown as { hibit?: unknown }).hibit = undefined;
    vi.restoreAllMocks();
  });

  function findButton(text: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(text),
    );
  }

  it("asks the app to open the factory from the status bar", () => {
    const onShowActivity = vi.fn();
    renderWorkspace(host, {
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
      onShowActivity,
    });

    expect(host.querySelector(".hb-factory")).toBeNull();
    const open = findButton("The Factory");
    expect(open).toBeDefined();

    act(() => open?.click());
    expect(onShowActivity).toHaveBeenCalledOnce();
  });

  it("renders every creation on the floor when open", () => {
    renderWorkspace(host, {
      showActivity: true,
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
    });

    const floor = host.querySelector(".hb-factory");
    expect(floor).not.toBeNull();
    expect(floor?.textContent).toContain("Cat Jump");
    expect(floor?.textContent).toContain("Star Maze");
  });

  it("plays a playable creation from the floor", () => {
    const onPlayPreview = vi.fn();
    renderWorkspace(host, {
      showActivity: true,
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
      playableProjectIds: ["p2"],
      onPlayPreview,
    });

    // Only the playable creation (p2) gets a Play button.
    const play = findButton("Play");
    expect(play).toBeDefined();
    act(() => play?.click());
    expect(onPlayPreview).toHaveBeenCalledWith("p2");
  });

  it("offers no Play for a creation without a preview", () => {
    renderWorkspace(host, {
      showActivity: true,
      creations: [makeCreation("p1", "Cat Jump"), makeCreation("p2", "Star Maze")],
      playableProjectIds: ["p2"],
    });

    const machines = Array.from(host.querySelectorAll(".hb-factory-machine"));
    const catJump = machines.find((machine) => machine.textContent?.includes("Cat Jump"));
    expect(catJump?.textContent).not.toContain("Play");
    // Exactly one machine (the playable Star Maze) carries a Play button.
    expect(host.querySelectorAll(".hb-play-button")).toHaveLength(1);
  });
});
