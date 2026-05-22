// @vitest-environment jsdom

import type { ChatMessage, ToolActivity } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./ChatWorkspace";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("ChatWorkspace", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("renders a kid-facing header without provider or account identifiers", async () => {
    await renderWorkspace(root, host, {
      messages: [assistantMessage("Ready when you are.")],
      tools: [],
    });

    expect(host.textContent).toContain("Maze");
    expect(host.textContent).toContain("Bit is ready");
    expect(host.textContent).toContain("Ada is building with Bit");
    expect(host.textContent).not.toContain("openai-codex/gpt-5.5");
    expect(host.textContent).not.toContain("Codex provider connected");
    expect(host.textContent).not.toContain("bd596edf-af40-4776-b10f-a7f2ffdb4ab3");
  });

  it("uses a full-width chat layout when there is no tool activity", async () => {
    await renderWorkspace(root, host, {
      messages: [assistantMessage("Ready when you are.")],
      tools: [],
    });

    const layout = host.querySelector(".hb-chat-layout");

    expect(layout?.classList.contains("hb-chat-layout-full")).toBe(true);
    expect(host.textContent).not.toContain("Tool activity");
  });

  it("shows project starter ideas before the first message", async () => {
    await renderWorkspace(root, host, {
      messages: [],
      tools: [],
    });

    expect(host.textContent).toContain("What should Bit build first?");
    expect(host.textContent).toContain("Make it faster");
    expect(host.textContent).toContain("Add a timer");
    expect(host.textContent).toContain("Change the colors");
  });
});

async function renderWorkspace(
  root: Root,
  host: HTMLElement,
  overrides: { messages: ChatMessage[]; tools: ToolActivity[] },
): Promise<void> {
  await act(async () => {
    root.render(
      <ChatWorkspace
        profile={adaProfile()}
        project={mazeProject()}
        messages={overrides.messages}
        tools={overrides.tools}
        draft=""
        running={false}
        error={null}
        onDraftChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        onBack={vi.fn()}
        onOpenFolder={vi.fn()}
        onSwitchProfile={vi.fn()}
      />,
    );
  });
  expect(host.textContent).toContain("Maze");
}

function assistantMessage(text: string): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
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

function mazeProject() {
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
