// @vitest-environment jsdom
import type { Profile } from "@shared/profile";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProgressStore } from "../state/progressStore";
import { KidChat } from "./KidChat";

const profile: Profile = {
  id: "kid-1",
  name: "Ada",
  age: 8,
  interests: [],
  sessions: { kid: "kid-session", parent: "parent-session" },
  createdAt: "2026-01-01T00:00:00.000Z",
  dreamHistory: [],
};

describe("KidChat cursor target action", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    useChatStore.setState({
      messages: [
        {
          id: "bit-1",
          role: "bit",
          kind: "text",
          text: "Replace line 9 with a button.",
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

    (globalThis as unknown as { window: { hibit: { onBitDelta: () => () => void } } }).window = {
      hibit: { onBitDelta: () => () => {} },
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useChatStore.getState().reset();
    useProgressStore.getState().reset();
  });

  it("shows Show me where before the editor is docked", async () => {
    const onShowCursorTarget = vi.fn(async () => {});

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={onShowCursorTarget} />);
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Show me where",
    );

    expect(button).toBeTruthy();
  });

  it("sends the latest Bit message when Show me where is clicked before docking", async () => {
    const onShowCursorTarget = vi.fn(async () => {});

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={onShowCursorTarget} />);
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Show me where",
    );
    if (!button) throw new Error("Show me where button was not rendered");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onShowCursorTarget).toHaveBeenCalledWith("Replace line 9 with a button.");
  });
});
