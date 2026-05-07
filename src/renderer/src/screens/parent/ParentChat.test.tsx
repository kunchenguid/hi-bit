// @vitest-environment jsdom
import type { SendMessageResult } from "@shared/chat";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useParentChatStore } from "../../state/parentChatStore";
import { ParentChat } from "./ParentChat";

type HiBitApi = typeof window.hibit;

function mockHiBit(partial: Partial<HiBitApi>): void {
  (globalThis as unknown as { window: { hibit: HiBitApi } }).window = {
    hibit: {
      getAppInfo: vi.fn(),
      listProfiles: vi.fn(),
      createProfile: vi.fn(),
      getTranscript: vi.fn().mockResolvedValue([]),
      sendParentMessage: vi.fn().mockResolvedValue({ ok: true, text: "ok", durationMs: 1 }),
      ...partial,
    } as HiBitApi,
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderControlledChat(initialDraft = ""): void {
  function ControlledChat(): React.JSX.Element {
    const [draft, setDraft] = useState(initialDraft);
    return (
      <ParentChat
        profileId="kid-1"
        parentSessionId="parent-session"
        kidName="Ada"
        draft={draft}
        onDraftChange={setDraft}
      />
    );
  }

  root.render(<ControlledChat />);
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  useParentChatStore.setState({
    messages: [],
    status: "idle",
    error: null,
    hydrateStatus: "idle",
    hydrateError: null,
    hydratedSessionId: null,
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ParentChat", () => {
  it("uses the controlled draft value for edits and sending", async () => {
    const sendParentMessage = vi
      .fn<HiBitApi["sendParentMessage"]>()
      .mockResolvedValue({ ok: true, text: "ok", durationMs: 1 } satisfies SendMessageResult);
    mockHiBit({ sendParentMessage });

    await act(async () => {
      renderControlledChat("Focus on CSS");
    });

    const input = host.querySelector<HTMLInputElement>("input.hb-parent-chat-input");
    expect(input?.value).toBe("Focus on CSS");

    await act(async () => {
      if (input) setInputValue(input, "  Slow down on loops  ");
    });
    expect(input?.value).toBe("  Slow down on loops  ");

    const form = host.querySelector<HTMLFormElement>("form.hb-parent-chat-input-row");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(sendParentMessage).toHaveBeenCalledWith("kid-1", "Slow down on loops");
    expect(input?.value).toBe("");
  });
});
