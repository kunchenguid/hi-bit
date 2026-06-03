// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function textarea(host: HTMLElement): HTMLTextAreaElement {
  const element = host.querySelector<HTMLTextAreaElement>("textarea");
  if (!element) throw new Error("composer textarea not found");
  return element;
}

function pressEnter(
  target: HTMLTextAreaElement,
  options: { shiftKey?: boolean; isComposing?: boolean } = {},
): boolean {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (options.isComposing) {
    Object.defineProperty(event, "isComposing", { value: true });
  }
  const result = { defaultPrevented: false };
  act(() => {
    // dispatchEvent returns false when preventDefault was called.
    result.defaultPrevented = !target.dispatchEvent(event);
  });
  return result.defaultPrevented;
}

describe("Composer", () => {
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

  it("sends the message when Enter is pressed", () => {
    const onSend = vi.fn();
    act(() =>
      root.render(
        <Composer
          value="hello bit"
          running={false}
          onChange={vi.fn()}
          onSend={onSend}
          onAbort={vi.fn()}
        />,
      ),
    );

    const prevented = pressEnter(textarea(host));

    expect(onSend).toHaveBeenCalledOnce();
    expect(prevented).toBe(true);
  });

  it("inserts a newline when Shift+Enter is pressed", () => {
    const onSend = vi.fn();
    act(() =>
      root.render(
        <Composer
          value="hello bit"
          running={false}
          onChange={vi.fn()}
          onSend={onSend}
          onAbort={vi.fn()}
        />,
      ),
    );

    const prevented = pressEnter(textarea(host), { shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it("does not send while a turn is running", () => {
    const onSend = vi.fn();
    act(() =>
      root.render(
        <Composer
          value="hello bit"
          running={true}
          onChange={vi.fn()}
          onSend={onSend}
          onAbort={vi.fn()}
        />,
      ),
    );

    pressEnter(textarea(host));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send while an IME composition is active", () => {
    const onSend = vi.fn();
    act(() =>
      root.render(
        <Composer
          value="こんにち"
          running={false}
          onChange={vi.fn()}
          onSend={onSend}
          onAbort={vi.fn()}
        />,
      ),
    );

    pressEnter(textarea(host), { isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
  });
});
