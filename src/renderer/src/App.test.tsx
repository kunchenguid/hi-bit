// @vitest-environment jsdom

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

  it("requires a kid profile before listing projects", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.list = vi.fn(async () => []);

    await renderApp(root);

    expect(host.textContent).toContain("Who's using Hi-Bit?");
    expect(host.textContent).toContain("Create profile");
    expect(host.textContent).not.toContain("Log out");
    expect(api.projects.list).not.toHaveBeenCalled();
  });

  it("creates the first kid profile before opening projects", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      accountId: "bd596edf-af40-4776-b10f-a7f2ffdb4ab3",
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
    expect(api.projects.list).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("What does Ada want to build?");
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

  it("shows profile-scoped project picker after authentication", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      accountId: "acct-1",
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.projects.list = vi.fn(async () => []);

    await renderApp(root);

    expect(api.projects.list).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("What does Ada want to build?");
    expect(host.textContent).toContain("New project");
    expect(host.textContent).not.toContain("Log out");

    const editProfile = Array.from(host.querySelectorAll("summary")).find((summary) =>
      summary.textContent?.includes("Edit profile"),
    );
    expect(editProfile?.classList.contains("hb-button")).toBe(true);
    expect(editProfile?.closest(".hb-header-actions")).not.toBeNull();
  });

  it("rejects fractional ages before updating a kid profile", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      accountId: "acct-1",
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.projects.list = vi.fn(async () => []);

    await renderApp(root);
    await openDetails(host, "Edit profile");
    await fillInput(host, "profileAge", "9.5");
    await clickButton(host, "Save profile");

    expect(api.profiles.update).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Age must be a whole number between 3 and 18.");
  });

  it("opens profile-scoped projects after selecting a kid", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => null);
    api.profiles.list = vi.fn(async () => [adaProfile()]);

    await renderApp(root);
    await clickButton(host, "Ada");

    expect(api.profiles.setActiveId).toHaveBeenCalledWith("ada");
    expect(api.projects.list).toHaveBeenCalledWith("ada");
    expect(host.textContent).toContain("What does Ada want to build?");
  });

  it("renders a chat workspace for the selected profile project", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile()]);
    api.projects.list = vi.fn(async () => [
      {
        schemaVersion: 1 as const,
        id: "project-1",
        factoryId: "default",
        profileId: "ada",
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

    expect(api.chat.load).toHaveBeenCalledWith("ada", "project-1");
    expect(host.textContent).toContain("Maze");
    expect(host.textContent).toContain("Bit is ready");
    expect(host.textContent).toContain("Ada is building with Bit");
    expect(host.textContent).toContain("Ready when you are.");
    expect(host.textContent).toContain("Ask Bit to build");
    expect(host.textContent).not.toContain("Codex provider connected");
    expect(host.textContent).not.toContain("bd596edf-af40-4776-b10f-a7f2ffdb4ab3");
    expect(host.textContent).not.toContain("Log out");
    expect(host.textContent).not.toContain("signed in as");
  });

  it("switches from the project picker back to the kid profile gate", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile(), samProfile()]);
    api.projects.list = vi.fn(async (profileId) => (profileId === "ada" ? [] : [samProject()]));

    await renderApp(root);
    await clickButton(host, "Switch profile");
    await clickButton(host, "Sam");

    expect(api.profiles.setActiveId).toHaveBeenCalledWith(null);
    expect(api.profiles.setActiveId).toHaveBeenCalledWith("sam");
    expect(api.projects.list).toHaveBeenLastCalledWith("sam");
    expect(host.textContent).toContain("Sam site");
  });

  it("switches from chat back to the kid profile gate", async () => {
    api.auth.status = vi.fn(async () => ({
      authenticated: true,
      storage: { path: "/tmp/codex.json", encrypted: true },
    }));
    api.profiles.getActiveId = vi.fn(async () => "ada");
    api.profiles.list = vi.fn(async () => [adaProfile(), samProfile()]);
    api.projects.list = vi.fn(async (profileId) =>
      profileId === "ada" ? [adaProject()] : [samProject()],
    );

    await renderApp(root);
    await clickButton(host, "Switch profile");

    expect(api.profiles.setActiveId).toHaveBeenCalledWith(null);
    expect(host.textContent).toContain("Pick a profile.");
    expect(host.textContent).toContain("Ada");
    expect(host.textContent).toContain("Sam");
    expect(host.textContent).not.toContain("Maze");
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

async function openDetails(host: HTMLElement, label: string): Promise<void> {
  const summary = Array.from(host.querySelectorAll("summary")).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!summary) throw new Error(`Summary not found: ${label}`);
  await act(async () => {
    summary.click();
  });
  await flushAsyncWork();
}

async function fillInput(host: HTMLElement, name: string, value: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
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

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });
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
  };
}

function adaProject() {
  return {
    schemaVersion: 1 as const,
    id: "project-1",
    factoryId: "default",
    profileId: "ada",
    title: "Maze",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function samProject() {
  return {
    schemaVersion: 1 as const,
    id: "project-2",
    factoryId: "default",
    profileId: "sam",
    title: "Sam site",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
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
      load: vi.fn(async (_profileId, projectId) => ({
        projectId,
        messages: [],
        tools: [],
        isRunning: false,
      })),
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
