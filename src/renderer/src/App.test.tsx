// @vitest-environment jsdom

import type { ChatEvent } from "@shared/chat";
import type { HiBitApi } from "@shared/ipc";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: HiBitApi;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    api = createApiMock();
    Object.defineProperty(window, "hibit", {
      value: api,
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("opens on the Codex provider gate when Codex is not connected", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: false,
      storage: { path: "/tmp/codex.json", encrypted: false },
    }));

    await renderApp(root);

    expect(host.textContent).toContain("Connect Codex");
    expect(host.textContent).toContain("not a Hi-Bit account");
    expect(host.textContent).toContain("Hi-Bit stores your token locally");
  });

  it("requires a kid profile before chatting", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.list = vi.fn(async () => []);

    await renderApp(root);

    expect(host.textContent).toContain("Who's using Hi-Bit?");
    expect(host.textContent).toContain("Create profile");
    expect(host.textContent).not.toContain("Log out");
    expect(api.chat.load).not.toHaveBeenCalled();
  });

  it("creates the first kid profile and lands straight in chat", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.list = vi.fn(async () => []);

    await renderApp(root);
    await fillInput(host, "name", "Ada");
    await fillInput(host, "age", "9");
    await clickButton(host, "Create profile");

    expect(api.profiles.create).toHaveBeenCalledWith({
      name: "Ada",
      age: 9,
      interests: [],
      notes: undefined,
    });
    expect(api.profiles.setActiveId).toHaveBeenCalledWith("ada");
    expect(api.chat.load).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("Hi Ada - what should we build?");
  });

  it("rejects fractional ages before creating a kid profile", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.list = vi.fn(async () => []);

    await renderApp(root);
    await fillInput(host, "name", "Ada");
    await fillInput(host, "age", "9.5");
    await clickButton(host, "Create profile");

    expect(api.profiles.create).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Age must be a whole number between 3 and 18.");
  });

  it("opens chat directly for the active profile (no project picker)", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      accountId: "acct-1",
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);

    await renderApp(root);

    expect(api.chat.load).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("Hi Ada - what should we build?");
    expect(host.textContent).toContain("Codex provider connected");
    expect(host.textContent).toContain("Ask Bit to build");
    expect(host.textContent).not.toContain("New project");
    expect(host.textContent).not.toContain("Log out");

    const editProfile = Array.from(host.querySelectorAll("summary")).find((summary) =>
      summary.textContent?.includes("Edit profile"),
    );
    expect(editProfile?.classList.contains("hb-button")).toBe(true);
  });

  it("rejects fractional ages before updating a kid profile", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      accountId: "acct-1",
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);

    await renderApp(root);
    await fillInput(host, "profileAge", "9.5");
    await clickButton(host, "Save profile");

    expect(api.profiles.update).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Age must be a whole number between 3 and 18.");
  });

  it("opens chat after selecting a kid", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => null);
    api.profiles.list = vi.fn(async () => [adaProfile()]);

    await renderApp(root);
    await clickButton(host, "Ada");

    expect(api.profiles.setActiveId).toHaveBeenCalledWith("ada");
    expect(api.chat.load).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("Hi Ada - what should we build?");
  });

  it("renders the profile-level transcript in chat", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.load = vi.fn(async (profileId) => ({
      profileId,
      messages: [
        {
          id: "m1",
          role: "assistant" as const,
          text: "Ready when you are.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activity: [],
      isRunning: false,
      previews: [],
      playableProjectIds: [],
    }));

    await renderApp(root);

    expect(api.chat.load).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("Ready when you are.");
    expect(host.textContent).toContain("Ask Bit to build");
  });

  it("surfaces a load failure instead of silently blanking the chat", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.load = vi.fn(async () => {
      throw new Error("could not read chat");
    });

    await renderApp(root);

    expect(host.textContent).toContain("Hi Ada - what should we build?");
    expect(host.textContent).toContain("could not read chat");
  });

  it("sends a message scoped to the profile, not a project", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);

    await renderApp(root);
    await fillInput(host, "hibit-composer", "make a cat game");
    await clickButton(host, "Send");

    expect(api.chat.send).toHaveBeenCalledWith("ada", "make a cat game", undefined);
  });

  it("rests the activity chip and opens the factory floor", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.load = vi.fn(async (profileId) => ({
      profileId,
      messages: [],
      activity: [
        {
          projectId: "p1",
          title: "Cat Jump",
          status: "done" as const,
          updatedAt: "2026-01-01T00:00:00.000Z",
          steps: [{ callId: "c1", toolName: "write", status: "completed" as const, content: [] }],
        },
      ],
      isRunning: false,
      previews: [],
      playableProjectIds: [],
    }));

    await renderApp(root);

    // Resting chip, no growing panel on the main screen.
    expect(host.textContent).toContain("All caught up");
    expect(host.textContent).toContain("last worked on Cat Jump");
    expect(host.textContent).not.toContain("What Bit is building");

    await clickButton(host, "The Factory");
    expect(host.textContent).toContain("Your factory");
    expect(host.textContent).toContain("Cat Jump");
  });

  it("names the bot in the activity bar when a build starts", async () => {
    let emit: (event: ChatEvent) => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.onEvent = vi.fn((listener) => {
      emit = listener;
      return () => {};
    });

    await renderApp(root);
    await act(async () => {
      emit({
        type: "build_start",
        profileId: "ada",
        turnId: "t1",
        projectId: "p1",
        projectTitle: "Cat Jump",
      });
    });

    expect(host.textContent).toContain("A bot is working on Cat Jump");
  });

  it("shows a captioned thinking bubble while Bit digests a bot result, without locking the composer", async () => {
    let emit: (event: ChatEvent) => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    // A prior Bit reply is the last message on screen - the stale-assistant case
    // where the old "is the last message an assistant?" gate hid the dots.
    api.chat.load = vi.fn(async (profileId) => ({
      profileId,
      messages: [
        {
          id: "assistant-earlier",
          role: "assistant" as const,
          text: "On it! A bot is building that.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activity: [],
      isRunning: false,
      previews: [],
      playableProjectIds: [],
    }));
    api.chat.onEvent = vi.fn((listener) => {
      emit = listener;
      return () => {};
    });

    await renderApp(root);
    await act(async () => {
      emit({
        type: "turn_start",
        kind: "bot_result",
        profileId: "ada",
        turnId: "w1",
        projectId: "p1",
      });
    });

    // The dots show with the canonical bot caption...
    expect(host.querySelector(".hb-message-thinking")).not.toBeNull();
    expect(host.querySelector(".hb-thinking-caption")?.textContent).toContain("bot");
    // ...but the composer stays open: Send (not Stop), input enabled.
    const composer = host.querySelector<HTMLTextAreaElement>("#hibit-composer");
    expect(composer?.disabled).toBe(false);
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "Stop")).toBe(
      false,
    );

    // Once Bit's bot-result reply streams in, the dots step aside.
    await act(async () => {
      emit({ type: "assistant_delta", profileId: "ada", turnId: "w1", text: "Cat Jump is ready!" });
      emit({
        type: "turn_end",
        kind: "bot_result",
        profileId: "ada",
        turnId: "w1",
        status: "completed",
      });
    });
    expect(host.querySelector(".hb-message-thinking")).toBeNull();
    expect(host.textContent).toContain("Cat Jump is ready!");
  });

  it("restores a bot-result thinking bubble from the loaded snapshot without locking the composer", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.load = vi.fn(async (profileId) => ({
      profileId,
      messages: [
        {
          id: "assistant-earlier",
          role: "assistant" as const,
          text: "A bot is building that.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activity: [],
      isRunning: true,
      activeTurn: { id: "w1", kind: "bot_result" as const },
      previews: [],
      playableProjectIds: [],
    }));

    await renderApp(root);

    expect(host.querySelector(".hb-message-thinking")).not.toBeNull();
    expect(host.querySelector(".hb-thinking-caption")?.textContent).toContain("bot");
    expect(host.querySelector<HTMLTextAreaElement>("#hibit-composer")?.disabled).toBe(false);
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "Stop")).toBe(
      false,
    );
  });

  it("queues a kid reply behind a bot-result turn without showing Stop for the queued reply", async () => {
    let emit: (event: ChatEvent) => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.onEvent = vi.fn((listener) => {
      emit = listener;
      return () => {};
    });

    await renderApp(root);
    await act(async () => {
      emit({
        type: "turn_start",
        kind: "bot_result",
        profileId: "ada",
        turnId: "w1",
      });
    });
    await fillInput(host, "hibit-composer", "also add stars");
    await clickButton(host, "Send");

    expect(api.chat.send).toHaveBeenCalledWith("ada", "also add stars", undefined);
    expect(host.querySelector<HTMLTextAreaElement>("#hibit-composer")?.disabled).toBe(false);
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "Stop")).toBe(
      false,
    );
  });

  it("opens the preview pane when the kid presses Play after a preview is ready", async () => {
    let emit: (event: ChatEvent) => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.onEvent = vi.fn((listener) => {
      emit = listener;
      return () => {};
    });

    await renderApp(root);
    await act(async () => {
      emit({
        type: "preview_ready",
        profileId: "ada",
        projectId: "p1",
        projectTitle: "Snake Game",
        url: "http://127.0.0.1:4310/",
      });
    });

    expect(host.querySelector("iframe")).toBeNull(); // not until the kid presses Play
    await clickButton(host, "Play");

    const frame = host.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("http://127.0.0.1:4310/");
    expect(host.textContent).toContain("Snake Game");
  });

  it("shows Play on the live 'ready' bubble whose delta is tagged with the creation", async () => {
    let emit: (event: ChatEvent) => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.onEvent = vi.fn((listener) => {
      emit = listener;
      return () => {};
    });

    await renderApp(root);
    await act(async () => {
      emit({ type: "turn_start", profileId: "ada", turnId: "t9" });
      emit({
        type: "preview_ready",
        profileId: "ada",
        projectId: "p1",
        projectTitle: "Snake Game",
        url: "http://127.0.0.1:4310/",
      });
      // The streamed reply carries the previewed creation (server-decorated).
      emit({
        type: "assistant_delta",
        profileId: "ada",
        turnId: "t9",
        projectId: "p1",
        text: "Snake Game is ready! Press Play.",
      });
      emit({ type: "turn_end", profileId: "ada", turnId: "t9", status: "completed" });
    });

    // Two Play buttons now: one on the bubble, one in the persistent bar.
    const playButtons = host.querySelectorAll(".hb-play-button");
    expect(playButtons.length).toBe(2);
    expect(host.querySelector(".hb-message-assistant .hb-play-button")).not.toBeNull();
  });

  it("recovers Play on the ready bubble and bar after a restart with no live server", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.chat.load = vi.fn(async (profileId) => ({
      profileId,
      messages: [
        {
          id: "m1",
          role: "assistant" as const,
          text: "Snake Game is ready! Press Play.",
          createdAt: "2026-01-01T00:00:00.000Z",
          projectId: "p1",
        },
      ],
      activity: [],
      isRunning: false,
      previews: [], // server was killed on the previous quit
      playableProjectIds: ["p1"], // but Bit can restart it
    }));

    await renderApp(root);

    // Both Play buttons come back even though nothing is running.
    expect(host.querySelectorAll(".hb-play-button").length).toBe(2);

    // Pressing Play restarts the server on demand and opens the pane.
    await clickButton(host, "Play");
    expect(api.preview.play).toHaveBeenCalledWith("ada", "p1");
    expect(host.querySelector("iframe")?.getAttribute("src")).toBe("http://127.0.0.1:4310/");
  });

  it("ignores a Play result if the kid switches profiles before it resolves", async () => {
    const playResult = deferred<Awaited<ReturnType<HiBitApi["preview"]["play"]>>>();
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile(), samProfile()]);
    api.chat.load = vi.fn(async (profileId) => ({
      profileId,
      messages:
        profileId === "ada"
          ? [
              {
                id: "m1",
                role: "assistant" as const,
                text: "Snake Game is ready! Press Play.",
                createdAt: "2026-01-01T00:00:00.000Z",
                projectId: "p1",
              },
            ]
          : [],
      activity: [],
      isRunning: false,
      previews: [],
      playableProjectIds: profileId === "ada" ? ["p1"] : [],
    }));
    api.preview.play = vi.fn(() => playResult.promise);

    await renderApp(root);
    await clickButton(host, "Play");
    await clickButton(host, "Switch profile");
    await clickButton(host, "Sam");

    await act(async () => {
      playResult.resolve({
        projectId: "p1",
        title: "Snake Game",
        url: "http://127.0.0.1:4310/",
        startedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    await flushAsyncWork();

    expect(host.textContent).toContain("Hi Sam - what should we build?");
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("clears an attached picture when switching profiles", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile(), samProfile()]);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 8, height: 8, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "#ffffff",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,ATTACHED_BYTES",
    );

    await renderApp(root);
    await pasteImage(host);
    expect(host.querySelector(".hb-composer-chip img")?.getAttribute("src")).toContain(
      "ATTACHED_BYTES",
    );

    await clickButton(host, "Switch profile");
    await clickButton(host, "Sam");
    await fillInput(host, "hibit-composer", "what should we build?");
    await clickButton(host, "Send");

    expect(api.chat.send).toHaveBeenLastCalledWith("sam", "what should we build?", undefined);
  });

  it("switches from chat back to the kid profile gate", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile(), samProfile()]);

    await renderApp(root);
    await clickButton(host, "Switch profile");

    expect(api.profiles.setActiveId).toHaveBeenCalledWith(null);
    expect(host.textContent).toContain("Pick a profile.");
    expect(host.textContent).toContain("Ada");
    expect(host.textContent).toContain("Sam");
    expect(host.textContent).not.toContain("what should we build?");
  });

  it("overlays a blocking reconnect modal when the Codex token dies mid-session", async () => {
    let signalReconnect: () => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.auth.onReconnectRequired = vi.fn((listener) => {
      signalReconnect = listener;
      return () => {};
    });

    await renderApp(root);
    expect(host.querySelector(".hb-reconnect-backdrop")).toBeNull();

    await act(async () => {
      signalReconnect();
    });

    const dialog = host.querySelector('.hb-reconnect-backdrop[aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(host.textContent).toContain("Reconnect Codex");
    // The chat stays mounted underneath - no remount to the full-screen gate.
    expect(host.querySelector("#hibit-composer")).not.toBeNull();
  });

  it("reconnects without reloading the chat, preserving the live session", async () => {
    let signalReconnect: () => void = () => {};
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.auth.onReconnectRequired = vi.fn((listener) => {
      signalReconnect = listener;
      return () => {};
    });

    await renderApp(root);
    // Baseline load counts from the initial render; reconnecting must not add to
    // them (a chat reload would wipe the draft and any open preview).
    const loadsBefore = (api.chat.load as ReturnType<typeof vi.fn>).mock.calls.length;
    const listsBefore = (api.profiles.list as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      signalReconnect();
    });
    await clickButton(host, "Reconnect Codex");

    expect(api.auth.login).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".hb-reconnect-backdrop")).toBeNull();
    expect((api.chat.load as ReturnType<typeof vi.fn>).mock.calls.length).toBe(loadsBefore);
    expect((api.profiles.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(listsBefore);
    expect(host.querySelector("#hibit-composer")).not.toBeNull();
  });
});

async function renderApp(root: Root): Promise<void> {
  await act(async () => {
    root.render(<App />);
  });
  await flushAsyncWork();
}

async function clickButton(host: HTMLElement, label: string): Promise<void> {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => {
    button.click();
  });
  await flushAsyncWork();
}

async function fillInput(host: HTMLElement, name: string, value: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"], #${name}`,
  );
  if (!input) throw new Error(`Input not found: ${name}`);
  await act(async () => {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flushAsyncWork();
}

async function pasteImage(host: HTMLElement): Promise<void> {
  const input = host.querySelector<HTMLTextAreaElement>("#hibit-composer");
  if (!input) throw new Error("Composer not found");
  const file = new File(["image-bytes"], "picture.png", { type: "image/png" });
  const clipboardData = {
    items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
  };
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  await act(async () => {
    input.dispatchEvent(event);
  });
  await flushAsyncWork();
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function adaProfile() {
  return {
    schemaVersion: 1 as const,
    id: "ada",
    name: "Ada",
    age: 9,
    interests: ["space"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    unlockedConcepts: [],
    pendingConceptReveals: [],
    unlockStats: { buildsDelegated: 0, openedActivities: false },
  };
}

function samProfile() {
  return {
    schemaVersion: 1 as const,
    id: "sam",
    name: "Sam",
    age: 10,
    interests: ["music"],
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    unlockedConcepts: [],
    pendingConceptReveals: [],
    unlockStats: { buildsDelegated: 0, openedActivities: false },
  };
}

function createApiMock(): HiBitApi {
  return {
    app: {
      info: vi.fn(async () => ({
        version: "0.0.1",
        platform: "darwin" as const,
        userDataDir: "/tmp/userData",
        hiBitDir: "/tmp/userData/.hi-bit",
      })),
    },
    auth: {
      status: vi.fn(async () => ({
        authenticated: false,
        storage: { path: "", encrypted: false },
      })),
      login: vi.fn(async () => ({ authenticated: true, storage: { path: "", encrypted: true } })),
      logout: vi.fn(async () => {}),
      onReconnectRequired: vi.fn(() => () => {}),
    },
    profiles: {
      list: vi.fn(async () => []),
      create: vi.fn(async (input) => ({
        schemaVersion: 1 as const,
        id: "ada",
        name: input.name,
        age: input.age,
        interests: [...(input.interests ?? [])],
        notes: input.notes,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        unlockedConcepts: [],
        pendingConceptReveals: [],
        unlockStats: { buildsDelegated: 0, openedActivities: false },
      })),
      update: vi.fn(async (profileId, settings) => ({
        schemaVersion: 1 as const,
        id: profileId,
        name: settings.name ?? "Ada",
        age: settings.age ?? 9,
        interests: settings.interests ? [...settings.interests] : [],
        notes: settings.notes ?? undefined,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        unlockedConcepts: [],
        pendingConceptReveals: [],
        unlockStats: { buildsDelegated: 0, openedActivities: false },
      })),
      getActiveId: vi.fn(async () => null),
      setActiveId: vi.fn(async () => {}),
    },
    projects: {
      list: vi.fn(async () => []),
      create: vi.fn(async (_profileId, input) => ({
        schemaVersion: 1 as const,
        id: "project-1",
        factoryId: "default",
        profileId: "ada",
        title: input.title,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      openFolder: vi.fn(async () => {}),
    },
    chat: {
      load: vi.fn(async (profileId) => ({
        profileId,
        messages: [],
        activity: [],
        isRunning: false,
        previews: [],
        playableProjectIds: [],
      })),
      send: vi.fn(async () => ({
        ok: true as const,
        turnId: "turn-1",
        status: "completed" as const,
      })),
      abort: vi.fn(async () => {}),
      markActivitiesOpened: vi.fn(async () => {}),
      onEvent: vi.fn(() => () => {}),
    },
    preview: {
      play: vi.fn(async (_profileId, projectId) => ({
        projectId,
        title: "Snake Game",
        url: "http://127.0.0.1:4310/",
        startedAt: "2026-01-01T00:00:00.000Z",
      })),
      openExternal: vi.fn(async () => {}),
      clearCache: vi.fn(async () => {}),
    },
  };
}
