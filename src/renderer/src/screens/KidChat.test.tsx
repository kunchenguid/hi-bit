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
          text: "Replace line 9 with this button:\n\n```html\n<button>Play</button>\n```",
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

  it("shows Show me where on each code block of the latest Bit message", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "bit-2",
          role: "bit",
          kind: "text",
          text: "Change your button line:\n\n```html\n<button>Play</button>\n```\n\nThen right before `</body>`:\n\n```html\n<script>play()</script>\n```",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const onShowCursorTarget = vi.fn(async () => {});

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={onShowCursorTarget} />);
    });

    const buttons = Array.from(host.querySelectorAll("button")).filter(
      (el) => el.textContent === "Show me where",
    );

    expect(buttons).toHaveLength(2);
  });

  it("hides Show me where when the latest Bit message has no code block", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "bit-plain",
          role: "bit",
          kind: "text",
          text: "Replace line 9 with a button.",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const onShowCursorTarget = vi.fn(async () => {});

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={onShowCursorTarget} />);
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (el) => el.textContent === "Show me where",
    );

    expect(button).toBeUndefined();
  });

  it("does not show Show me where on older Bit messages", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "bit-old",
          role: "bit",
          kind: "text",
          text: "Old step:\n\n```html\n<h1>Old</h1>\n```",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "bit-new",
          role: "bit",
          kind: "text",
          text: "New step. No code here.",
          timestamp: "2026-01-01T00:00:01.000Z",
        },
      ],
    });
    const onShowCursorTarget = vi.fn(async () => {});

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={onShowCursorTarget} />);
    });

    const buttons = Array.from(host.querySelectorAll("button")).filter(
      (el) => el.textContent === "Show me where",
    );
    expect(buttons).toHaveLength(0);
  });

  it("passes the clicked snippet and the full Bit message to the handler", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "bit-3",
          role: "bit",
          kind: "text",
          text: "Change your button line:\n\n```html\n<button>Play</button>\n```\n\nThen right before `</body>`:\n\n```html\n<script>play()</script>\n```",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const onShowCursorTarget = vi.fn(async () => {});

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={onShowCursorTarget} />);
    });

    const buttons = Array.from(host.querySelectorAll("button")).filter(
      (el) => el.textContent === "Show me where",
    );
    if (buttons.length < 2) throw new Error("Expected two Show me where buttons");

    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onShowCursorTarget).toHaveBeenCalledTimes(1);
    expect(onShowCursorTarget).toHaveBeenCalledWith(
      "<script>play()</script>",
      "Change your button line:\n\n```html\n<button>Play</button>\n```\n\nThen right before `</body>`:\n\n```html\n<script>play()</script>\n```",
    );
  });
});
