// @vitest-environment jsdom

import type { SpotlightRect } from "@shared/browser";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpotlightOverlay } from "./SpotlightOverlay";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("SpotlightOverlay", () => {
  let host: HTMLDivElement;
  let root: Root;
  let push: (rect: SpotlightRect | null) => void = () => {};

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    // Minimal window.hibit with a controllable spotlight stream.
    (window as unknown as { hibit: unknown }).hibit = {
      browser: {
        onSpotlight: (listener: (rect: SpotlightRect | null) => void) => {
          push = listener;
          return () => {};
        },
      },
    };
    root = createRoot(host);
    act(() => root.render(<SpotlightOverlay />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders nothing until a spotlight rect arrives", () => {
    expect(host.querySelector(".hb-spotlight-ring")).toBeNull();
  });

  it("draws a ring (with padding) and a label when a rect is pushed", () => {
    act(() => push({ x: 100, y: 200, width: 40, height: 20, label: "Tap here to play" }));
    const ring = host.querySelector(".hb-spotlight-ring") as HTMLElement | null;
    expect(ring).not.toBeNull();
    // 8px padding on each side: left/top shift back, size grows by 16.
    expect(ring?.style.left).toBe("92px");
    expect(ring?.style.top).toBe("192px");
    expect(ring?.style.width).toBe("56px");
    expect(ring?.style.height).toBe("36px");
    expect(host.querySelector(".hb-spotlight-label")?.textContent).toBe("Tap here to play");
  });

  it("clears the spotlight when null is pushed", () => {
    act(() => push({ x: 1, y: 1, width: 1, height: 1 }));
    expect(host.querySelector(".hb-spotlight-ring")).not.toBeNull();
    act(() => push(null));
    expect(host.querySelector(".hb-spotlight-ring")).toBeNull();
  });

  it("surrounds the hole with four dim mask panels that absorb outside clicks", () => {
    act(() => push({ x: 100, y: 200, width: 40, height: 20 }));
    const masks = host.querySelectorAll(".hb-spotlight-mask");
    expect(masks).toHaveLength(4);
  });

  it("dismisses on any click (modal behaviour)", () => {
    act(() => push({ x: 100, y: 200, width: 40, height: 20 }));
    expect(host.querySelector(".hb-spotlight-ring")).not.toBeNull();
    act(() => window.dispatchEvent(new Event("pointerdown")));
    expect(host.querySelector(".hb-spotlight-ring")).toBeNull();
  });

  it("dismisses on Escape", () => {
    act(() => push({ x: 100, y: 200, width: 40, height: 20 }));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector(".hb-spotlight-ring")).toBeNull();
  });
});
