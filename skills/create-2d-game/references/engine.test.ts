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
  const source = readFileSync(resolve("skills/create-2d-game/references/engine.js"), "utf8");
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

function loadSave(store = new Map<string, string>()) {
  const sandbox = {
    window: { addEventListener() {} },
    requestAnimationFrame() {
      return 0;
    },
    cancelAnimationFrame() {},
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };
  const source = readFileSync(resolve("skills/create-2d-game/references/engine.js"), "utf8");
  const GameSave = vm.runInNewContext(`${source}\nGameSave;`, sandbox) as {
    namespace(name: string): void;
    load(name: string, fallback?: unknown): unknown;
    save(name: string, value: unknown): boolean;
    clear(name: string): void;
  };
  return { GameSave, store };
}

describe("create-2d-game GameSave", () => {
  it("round-trips JSON values and returns the fallback when nothing is saved", () => {
    const { GameSave } = loadSave();

    expect(GameSave.load("progress", { level: 1 })).toEqual({ level: 1 });
    expect(GameSave.save("progress", { level: 4, coins: 12 })).toBe(true);
    expect(GameSave.load("progress")).toEqual({ level: 4, coins: 12 });

    GameSave.clear("progress");
    expect(GameSave.load("progress", null)).toBeNull();
  });

  it("namespaces keys so two games never read each other's saves", () => {
    const store = new Map<string, string>();
    const a = loadSave(store).GameSave;
    const b = loadSave(store).GameSave;
    a.namespace("maze");
    b.namespace("racer");

    a.save("best", 100);
    b.save("best", 7);

    expect(a.load("best")).toBe(100);
    expect(b.load("best")).toBe(7);
  });

  it("returns false instead of throwing when storage is unavailable", () => {
    const source = readFileSync(resolve("skills/create-2d-game/references/engine.js"), "utf8");
    const GameSave = vm.runInNewContext(`${source}\nGameSave;`, {
      window: { addEventListener() {} },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame() {},
      localStorage: {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
        removeItem() {},
      },
    }) as { load(n: string, f?: unknown): unknown; save(n: string, v: unknown): boolean };

    expect(GameSave.save("progress", { level: 1 })).toBe(false);
    expect(GameSave.load("progress", "fallback")).toBe("fallback");
  });
});

describe("create-2d-game reference engine", () => {
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

  it("prevents browser defaults for mapped gameplay keys outside text entry", () => {
    const { dispatchWindow, engine } = loadEngine();
    const preventedKeys: string[] = [];

    engine.input.setKeys({ shoot: ["x"] });
    dispatchWindow("keydown", {
      key: "ArrowUp",
      target: { tagName: "BODY" },
      preventDefault() {
        preventedKeys.push("ArrowUp");
      },
    });
    dispatchWindow("keydown", {
      key: "x",
      target: { tagName: "BODY" },
      preventDefault() {
        preventedKeys.push("x");
      },
    });
    dispatchWindow("keydown", {
      key: " ",
      target: { tagName: "INPUT" },
      preventDefault() {
        preventedKeys.push("input space");
      },
    });

    expect(preventedKeys).toEqual(["ArrowUp", "x"]);
  });
});
