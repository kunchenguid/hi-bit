// @vitest-environment jsdom

import type { HiBitApi } from "@shared/ipc";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: HiBitApi;

  beforeEach(() => {
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

  it("opens on the auth gate when Codex is signed out", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: false,
      storage: { path: "/tmp/codex.json", encrypted: false },
    }));

    await renderApp(root);

    expect(host.textContent).toContain("Sign in to Codex");
    expect(host.textContent).toContain("Hi-Bit stores your token locally");
  });

  it("shows the project picker after authentication", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      accountId: "acct-1",
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.projects.list = vi.fn(async () => []);

    await renderApp(root);

    expect(host.textContent).toContain("What do you want to build?");
    expect(host.textContent).toContain("New project");
  });

  it("renders a chat workspace for the selected project", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.projects.list = vi.fn(async () => [
      {
        schemaVersion: 1 as const,
        id: "project-1",
        factoryId: "default",
        title: "Maze",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    api.chat.load = vi.fn(async () => ({
      projectId: "project-1",
      messages: [
        {
          id: "m1",
          role: "assistant" as const,
          text: "Ready when you are.",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      tools: [],
      isRunning: false,
    }));

    await renderApp(root);

    expect(host.textContent).toContain("Maze");
    expect(host.textContent).toContain("Ready when you are.");
    expect(host.textContent).toContain("Ask Bit to build");
  });
});

async function renderApp(root: Root): Promise<void> {
  await act(async () => {
    root.render(<App />);
  });
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });
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
    },
    projects: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({
        schemaVersion: 1 as const,
        id: "project-1",
        factoryId: "default",
        title: "Project",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      openFolder: vi.fn(async () => {}),
    },
    chat: {
      load: vi.fn(async (projectId) => ({ projectId, messages: [], tools: [], isRunning: false })),
      send: vi.fn(async () => ({
        ok: true as const,
        turnId: "turn-1",
        status: "completed" as const,
      })),
      abort: vi.fn(async () => {}),
      onEvent: vi.fn(() => () => {}),
    },
  };
}
