// @vitest-environment jsdom
/// <reference types="node" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingSpeedControl } from "./ThinkingSpeedControl";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("ThinkingSpeedControl", () => {
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

  function slider(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>("input[type=range]");
    if (!input) throw new Error("expected a range slider");
    return input;
  }

  it("renders a five-stop slider positioned at the current speed", () => {
    act(() => root.render(<ThinkingSpeedControl value="medium" busy={false} onChange={vi.fn()} />));

    const input = slider();
    expect(input.min).toBe("0");
    expect(input.max).toBe("4");
    expect(input.value).toBe("2");
    expect(host.querySelector(".hb-speed-control-value")?.textContent).toBe("Balanced");
  });

  it("reports the mapped speed when the grown-up moves the slider", () => {
    const onChange = vi.fn();
    act(() =>
      root.render(<ThinkingSpeedControl value="medium" busy={false} onChange={onChange} />),
    );

    const input = slider();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "4");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("xhigh");
  });

  it("disables the slider while a change is in flight", () => {
    act(() => root.render(<ThinkingSpeedControl value="low" busy={true} onChange={vi.fn()} />));
    expect(slider().disabled).toBe(true);
  });
});
