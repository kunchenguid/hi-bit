// @vitest-environment jsdom
import type { Dream, DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { Profile } from "@shared/profile";
import { emptyProgress, type Progress } from "@shared/progress";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
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

function makeDream(requires: string[]): Dream {
  return {
    id: "web-page",
    title_parent: "Web Page",
    title_kid: "web page",
    summary_kid: "Make a page.",
    categories: ["personal"],
    interest_tags: [],
    requires,
    style_hints: [],
    emoji: "",
    difficulty: 1,
  };
}

function makeKp(id: string, titleKid: string): KnowledgePoint {
  return {
    id,
    title_parent: titleKid,
    title_kid: titleKid,
    area: "html",
    prereqs: [],
    introduces: [],
    mastery_signals: { saw_it: "s", did_with_help: "d", did_unprompted: "u", explained_it: "e" },
  };
}

function graphOf(nodes: KnowledgePoint[]): KnowledgeGraph {
  return { nodes, byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

function libraryOf(dream: Dream): DreamLibrary {
  return { dreams: [dream], byId: { [dream.id]: dream } };
}

function progressWith(mastered: string[]): Progress {
  const progress = emptyProgress();
  for (const id of mastered) {
    progress.knowledgePoints[id] = {
      status: "did_with_help",
      firstSeenAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
    };
  }
  return progress;
}

describe("KidChat cursor target action", () => {
  let host: HTMLDivElement;
  let root: Root;
  let endKidSession: ReturnType<typeof vi.fn>;

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

    endKidSession = vi.fn(async () => {});
    (
      globalThis as unknown as {
        window: { hibit: { onBitDelta: () => () => void; endKidSession: typeof endKidSession } };
      }
    ).window = {
      hibit: { onBitDelta: () => () => {}, endKidSession },
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useChatStore.getState().reset();
    useProfileStore.setState({ activeProfileId: null });
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

  it("shows the empty chat mascot before the first message", async () => {
    useChatStore.setState({ messages: [] });

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={vi.fn()} />);
    });

    const mascot = host.querySelector<HTMLImageElement>(".hb-chat-empty-mascot");

    expect(mascot).not.toBeNull();
    expect(mascot?.getAttribute("aria-hidden")).toBe("true");
    expect(mascot?.alt).toBe("");
  });

  it("does not repeat the Bit label in docked mode", async () => {
    await act(async () => {
      root.render(<KidChat profile={profile} docked />);
    });

    expect(host.querySelector(".hb-chat-title")?.textContent).toBe("Bit");
    expect(host.querySelector(".hb-gate-kicker")?.textContent).not.toBe("Bit");
  });

  it("tells Bit when the editor is already open in docked mode", async () => {
    const send = vi.fn(async () => ({
      ok: true as const,
      text: "Use See my page.",
      durationMs: 1,
    }));
    useChatStore.setState({ send });

    await act(async () => {
      root.render(<KidChat profile={{ ...profile, currentDreamId: "show-me-around" }} docked />);
    });

    const input = host.querySelector<HTMLInputElement>('input[placeholder="type to Bit..."]');
    if (!input) throw new Error("missing chat input");
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "yes");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = host.querySelector("form");
    if (!form) throw new Error("missing chat form");
    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });

    expect(send).toHaveBeenCalledWith(profile.id, "yes", {
      uiContext:
        "The editor is already open next to chat. Do not ask the kid to click Open the editor; guide them using the visible editor controls instead.",
    });
  });

  it("tells Bit when the docked workspace is showing Page view", async () => {
    const send = vi.fn(async () => ({
      ok: true as const,
      text: "Use See my code first.",
      durationMs: 1,
    }));
    useChatStore.setState({ send });

    await act(async () => {
      root.render(
        <KidChat
          profile={{ ...profile, currentDreamId: "show-me-around" }}
          docked
          editorViewMode="preview"
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[placeholder="type to Bit..."]');
    if (!input) throw new Error("missing chat input");
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "yes");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = host.querySelector("form");
    if (!form) throw new Error("missing chat form");
    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });

    expect(send).toHaveBeenCalledWith(profile.id, "yes", {
      uiContext:
        "The editor is already open next to chat. The kid is currently looking at Page view, so code is not visible. Do not ask the kid to click Open the editor; first guide them to press See my code or Split before giving any code-edit instructions.",
    });
  });

  it("seeds the playground greeting as a freeform prompt", async () => {
    const playground = makeDream([]);
    playground.id = "playground";
    playground.mode = "freeform";
    playground.title_kid = "playground";
    useChatStore.setState({ messages: [], greetingForSessionId: null });
    useGraphStore.setState({
      status: "ready",
      graph: graphOf([]),
      library: libraryOf(playground),
    });
    useProgressStore.setState({
      status: "ready",
      profileId: profile.id,
      progress: emptyProgress(),
    });

    await act(async () => {
      root.render(<KidChat profile={{ ...profile, currentDreamId: "playground" }} />);
    });

    expect(host.textContent).toContain("Hey Ada! What would you like to do?");
  });

  it("does not show all-done learning progress for freeform dreams", async () => {
    const playground = makeDream([]);
    playground.id = "playground";
    playground.mode = "freeform";
    playground.title_kid = "playground";
    useGraphStore.setState({
      status: "ready",
      graph: graphOf([]),
      library: libraryOf(playground),
    });
    useProgressStore.setState({
      status: "ready",
      profileId: profile.id,
      progress: emptyProgress(),
    });

    await act(async () => {
      root.render(<KidChat profile={{ ...profile, currentDreamId: "playground" }} />);
    });

    expect(host.textContent).not.toContain("All skills learned");
    expect(host.textContent).not.toContain("ready to build!");
    expect(host.querySelector(".hb-chat-learning-strip")).toBeNull();
  });

  it("shows an avatar beside Bit messages without adding one to kid messages", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "bit-hello",
          role: "bit",
          kind: "text",
          text: "Hi Ada!",
          timestamp: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "kid-hello",
          role: "kid",
          kind: "text",
          text: "Hi Bit!",
          timestamp: "2026-01-01T00:00:01.000Z",
        },
      ],
    });

    await act(async () => {
      root.render(<KidChat profile={profile} onShowCursorTarget={vi.fn()} />);
    });

    expect(host.querySelectorAll(".hb-chat-row-bit .hb-chat-avatar")).toHaveLength(1);
    expect(host.querySelectorAll(".hb-chat-row-kid .hb-chat-avatar")).toHaveLength(0);
  });

  it("ends the warm kid runtime before returning to profiles", async () => {
    useProfileStore.setState({ activeProfileId: profile.id });

    await act(async () => {
      root.render(<KidChat profile={profile} />);
    });

    const done = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "I'm done for now",
    );
    if (!done) throw new Error("missing done button");
    await act(async () => {
      done.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const back = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Back to profiles",
    );
    if (!back) throw new Error("missing back button");

    await act(async () => {
      back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(endKidSession).toHaveBeenCalledWith(profile.id);
    expect(useProfileStore.getState().activeProfileId).toBeNull();
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

  it("keeps the learning header focused after a new skill is learned", async () => {
    const dream = makeDream(["three-parts"]);
    const graph = graphOf([
      makeKp("running-code", "running your code and seeing what happens"),
      makeKp("three-parts", "the three parts of a web page"),
    ]);
    useGraphStore.setState({ status: "ready", graph, library: libraryOf(dream) });
    useProgressStore.setState({
      status: "ready",
      profileId: profile.id,
      progress: emptyProgress(),
    });

    await act(async () => {
      root.render(<KidChat profile={{ ...profile, currentDreamId: dream.id }} />);
    });

    await act(async () => {
      useProgressStore.setState({ progress: progressWith(["running-code"]) });
    });

    expect(host.textContent).toContain(
      "New skill learned: running your code and seeing what happens.",
    );
    expect(host.textContent).toContain("Up next: the three parts of a web page");
    expect(host.textContent).not.toContain("1 learned");
    expect(host.textContent).not.toContain("0 of 1 done");
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
