import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadEngine() {
  const windowListeners = new Map<string, ((event: Record<string, unknown>) => void)[]>();
  const canvasListeners = new Map<string, ((event: Record<string, unknown>) => void)[]>();
  const frameCallbacks: FrameRequestCallback[] = [];
  const sandbox = {
    window: {
      addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
        windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]);
      },
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
    cancelAnimationFrame() {},
  };
  const source = readFileSync(resolve("skills/create-game/references/engine.js"), "utf8");
  const engine = vm.runInNewContext(`${source}\nHiBitGame;`, sandbox) as typeof import("./engine");
  const canvas = {
    width: 320,
    height: 240,
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
    addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
      canvasListeners.set(type, [...(canvasListeners.get(type) ?? []), listener]);
    },
  } as unknown as HTMLCanvasElement;

  return {
    engine,
    canvas,
    dispatchWindow(type: string, event: Record<string, unknown>) {
      for (const listener of windowListeners.get(type) ?? []) listener(event);
    },
    dispatchCanvas(type: string, event: Record<string, unknown>) {
      for (const listener of canvasListeners.get(type) ?? []) listener(event);
    },
    nextFrame(now: number) {
      const callback = frameCallbacks.shift();
      if (!callback) throw new Error("Expected a queued animation frame");
      callback(now);
    },
  };
}

describe("create-game reference engine", () => {
  it("keeps fixed-step edge inputs until an update consumes them", () => {
    const { canvas, dispatchCanvas, dispatchWindow, engine, nextFrame } = loadEngine();
    const observed = { jump: false, click: false };

    engine.run(canvas, {
      step: 1 / 60,
      update() {
        observed.jump = observed.jump || engine.input.wasPressed("jump");
        observed.click = observed.click || engine.input.pointer.clicked;
      },
    });

    nextFrame(0);
    dispatchWindow("keydown", { key: " " });
    dispatchCanvas("mousedown", { clientX: 10, clientY: 20 });
    nextFrame(8);
    nextFrame(17);

    expect(observed).toEqual({ jump: true, click: true });
  });
});
