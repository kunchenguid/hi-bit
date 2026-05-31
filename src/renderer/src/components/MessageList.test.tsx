// @vitest-environment jsdom

import type { ChatMessage } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const userMessage: ChatMessage = {
  id: "u1",
  role: "user",
  text: "make a cat game",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const assistantMessage: ChatMessage = {
  id: "assistant-t1",
  role: "assistant",
  text: "On it!",
  createdAt: "2026-01-01T00:00:01.000Z",
};

describe("MessageList", () => {
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
  });

  const sparkByLabel = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".hb-idea-spark")].find((b) =>
      b.textContent?.includes(label),
    );

  it("shows a thinking bubble while Bit is responding", () => {
    act(() => root.render(<MessageList messages={[userMessage]} thinking={true} />));
    expect(host.querySelector(".hb-message-thinking")).not.toBeNull();
  });

  it("hides the thinking bubble when Bit is idle", () => {
    act(() => root.render(<MessageList messages={[userMessage]} thinking={false} />));
    expect(host.querySelector(".hb-message-thinking")).toBeNull();
  });

  it("captions the thinking bubble when Bit is digesting a bot result", () => {
    act(() =>
      root.render(
        <MessageList
          messages={[assistantMessage]}
          thinking={true}
          thinkingReason="bot_result"
          botUnlocked={true}
        />,
      ),
    );
    const bubble = host.querySelector(".hb-message-thinking");
    expect(bubble).not.toBeNull();
    expect(host.querySelector(".hb-thinking-caption")?.textContent).toContain("bot");
    expect(bubble?.getAttribute("aria-label")).toContain("bot");
  });

  it("uses the pre-unlock builder word while Bit digests a bot result", () => {
    act(() =>
      root.render(
        <MessageList messages={[assistantMessage]} thinking={true} thinkingReason="bot_result" />,
      ),
    );
    const bubble = host.querySelector(".hb-message-thinking");
    expect(bubble).not.toBeNull();
    expect(host.querySelector(".hb-thinking-caption")?.textContent).toContain("builder");
    expect(bubble?.getAttribute("aria-label")).toContain("builder");
    expect(host.textContent).not.toContain("bot");
  });

  it("shows no caption for a plain reply thinking bubble", () => {
    act(() => root.render(<MessageList messages={[userMessage]} thinking={true} />));
    expect(host.querySelector(".hb-message-thinking")).not.toBeNull();
    expect(host.querySelector(".hb-thinking-caption")).toBeNull();
  });

  it("shows the thinking bubble even before the first message lands", () => {
    act(() => root.render(<MessageList messages={[]} thinking={true} />));
    expect(host.querySelector(".hb-message-thinking")).not.toBeNull();
    expect(host.querySelector(".hb-empty-chat")).toBeNull();
  });

  it("shows the empty prompt only when idle with no messages", () => {
    act(() => root.render(<MessageList messages={[]} thinking={false} />));
    expect(host.querySelector(".hb-empty-chat")).not.toBeNull();
  });

  it("greets the builder by name and offers idea sparks on the empty thread", () => {
    act(() => root.render(<MessageList messages={[]} thinking={false} builderName="Eddie" />));
    expect(host.querySelector(".hb-empty-greeting")?.textContent).toMatch(/hi eddie/i);
    expect(sparkByLabel("A tiny game")).toBeDefined();
    expect(sparkByLabel("A page about me")).toBeDefined();
    expect(sparkByLabel("Surprise me")).toBeDefined();
  });

  it("greets generically when no builder name is given", () => {
    act(() => root.render(<MessageList messages={[]} thinking={false} />));
    const greeting = host.querySelector(".hb-empty-greeting")?.textContent ?? "";
    expect(greeting).toMatch(/ready to build/i);
    expect(greeting).not.toMatch(/hi\s+!/i);
  });

  it("fills the composer with a concrete starter idea (it cannot send on its own)", () => {
    const onPickIdea = vi.fn();
    act(() => root.render(<MessageList messages={[]} thinking={false} onPickIdea={onPickIdea} />));
    act(() => sparkByLabel("A tiny game")?.click());
    expect(onPickIdea).toHaveBeenCalledTimes(1);
    // A spark hands back an editable starter sentence, never an empty string.
    // MessageList has no send capability at all, so filling is all it can do -
    // the kid still presses Send. That is what keeps it clear of the CTA rule.
    expect(onPickIdea.mock.calls[0][0]).toMatch(/\w/);
  });

  it("hides idea sparks once any message exists", () => {
    act(() =>
      root.render(
        <MessageList
          messages={[userMessage]}
          thinking={false}
          builderName="Eddie"
          onPickIdea={vi.fn()}
        />,
      ),
    );
    expect(host.querySelector(".hb-idea-sparks")).toBeNull();
    expect(host.querySelector(".hb-empty-chat")).toBeNull();
  });

  it("hides idea sparks while Bit is thinking on an empty thread", () => {
    act(() => root.render(<MessageList messages={[]} thinking={true} onPickIdea={vi.fn()} />));
    expect(host.querySelector(".hb-idea-sparks")).toBeNull();
    expect(host.querySelector(".hb-message-thinking")).not.toBeNull();
  });

  it("renders streamed assistant text instead of the thinking bubble", () => {
    act(() =>
      root.render(<MessageList messages={[userMessage, assistantMessage]} thinking={false} />),
    );
    expect(host.textContent).toContain("On it!");
    expect(host.querySelector(".hb-message-thinking")).toBeNull();
  });

  it("shows a Play button on an assistant message whose creation has a live preview", () => {
    const onPlay = vi.fn();
    const ready: ChatMessage = {
      id: "assistant-t2",
      role: "assistant",
      text: "Snake Game is ready!",
      createdAt: "2026-01-01T00:00:02.000Z",
      projectId: "project_1",
    };
    act(() =>
      root.render(
        <MessageList
          messages={[ready]}
          thinking={false}
          playableProjectIds={new Set(["project_1"])}
          onPlay={onPlay}
        />,
      ),
    );
    const play = host.querySelector<HTMLButtonElement>(".hb-play-button");
    expect(play).not.toBeNull();
    act(() => play?.click());
    expect(onPlay).toHaveBeenCalledWith("project_1");
  });

  it("shows no Play button when the creation has no live preview", () => {
    const ready: ChatMessage = {
      id: "assistant-t3",
      role: "assistant",
      text: "Snake Game is ready!",
      createdAt: "2026-01-01T00:00:02.000Z",
      projectId: "project_1",
    };
    act(() =>
      root.render(
        <MessageList messages={[ready]} thinking={false} playableProjectIds={new Set()} />,
      ),
    );
    expect(host.querySelector(".hb-play-button")).toBeNull();
  });
});
