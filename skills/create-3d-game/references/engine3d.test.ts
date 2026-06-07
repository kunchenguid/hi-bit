import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Loads engine3d.js the same way the 2D engine test loads engine.js: run the
// plain script in a sandbox with stubbed window/document/raf. We only exercise
// the loop, input, and collision math here - never real WebGL or THREE.
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
    document: {
      addEventListener() {},
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
    cancelAnimationFrame() {},
  };
  const source = readFileSync(resolve("skills/create-3d-game/references/engine3d.js"), "utf8");
  const engine = vm.runInNewContext(`${source}\nHiBit3D;`, sandbox) as typeof import("./engine3d");
  const canvas = {
    width: 320,
    height: 240,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
    addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
      canvasListeners.set(type, [...(canvasListeners.get(type) ?? []), listener]);
    },
    requestPointerLock() {},
  } as unknown as HTMLCanvasElement;
  // A world stand-in: run() only touches canvas + renderer.render(scene, camera).
  const world = { canvas, scene: {}, camera: {}, renderer: { render() {} } };

  return {
    engine,
    world,
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
    document: { addEventListener() {} },
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
  const source = readFileSync(resolve("skills/create-3d-game/references/engine3d.js"), "utf8");
  const GameSave = vm.runInNewContext(`${source}\nGameSave;`, sandbox) as {
    namespace(name: string): void;
    load(name: string, fallback?: unknown): unknown;
    save(name: string, value: unknown): boolean;
    clear(name: string): void;
  };
  return { GameSave, store };
}

describe("create-3d-game GameSave", () => {
  it("round-trips JSON values and returns the fallback when nothing is saved", () => {
    const { GameSave } = loadSave();

    expect(GameSave.load("world", { spawn: "start" })).toEqual({ spawn: "start" });
    expect(GameSave.save("world", { spawn: "cave", blocks: 30 })).toBe(true);
    expect(GameSave.load("world")).toEqual({ spawn: "cave", blocks: 30 });

    GameSave.clear("world");
    expect(GameSave.load("world", null)).toBeNull();
  });

  it("namespaces keys so two games never read each other's saves", () => {
    const store = new Map<string, string>();
    const a = loadSave(store).GameSave;
    const b = loadSave(store).GameSave;
    a.namespace("blocks");
    b.namespace("racer");

    a.save("best", 100);
    b.save("best", 7);

    expect(a.load("best")).toBe(100);
    expect(b.load("best")).toBe(7);
  });

  it("returns false instead of throwing when storage is unavailable", () => {
    const source = readFileSync(resolve("skills/create-3d-game/references/engine3d.js"), "utf8");
    const GameSave = vm.runInNewContext(`${source}\nGameSave;`, {
      window: { addEventListener() {} },
      document: { addEventListener() {} },
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

    expect(GameSave.save("world", { spawn: "cave" })).toBe(false);
    expect(GameSave.load("world", "fallback")).toBe("fallback");
  });
});

describe("create-3d-game reference engine", () => {
  it("keeps fixed-step edge inputs until an update consumes them", () => {
    const { dispatchCanvas, dispatchWindow, engine, nextFrame, world } = loadEngine();
    const observed = { jump: false, click: false };

    engine.run(world, {
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

  it("overlap reports when two 3D boxes share space", () => {
    const { engine } = loadEngine();
    const a = { x: 0, y: 0, z: 0, w: 2, h: 2, d: 2 };

    expect(engine.overlap(a, { x: 1, y: 1, z: 1, w: 2, h: 2, d: 2 })).toBe(true);
    expect(engine.overlap(a, { x: 5, y: 0, z: 0, w: 1, h: 1, d: 1 })).toBe(false);
    // Apart on the Z axis even though they share x and y.
    expect(engine.overlap(a, { x: 0, y: 0, z: 5, w: 1, h: 1, d: 1 })).toBe(false);
  });

  it("moveAndCollide lands a falling box on top of the ground and flags onGround", () => {
    const { engine } = loadEngine();
    // Start just above the ground and take one realistic falling step into it.
    // (Like the platformer recipe, collision assumes per-step moves, not teleports.)
    const player = { x: 0, y: 1.5, z: 0, w: 1, h: 1, d: 1 };
    const ground = { x: -10, y: 0, z: -10, w: 20, h: 1, d: 20 }; // top surface at y = 1

    const hit = engine.moveAndCollide(player, { x: 0, y: -1, z: 0 }, [ground]);

    expect(player.y).toBe(1); // resting on top of the ground
    expect(hit.onGround).toBe(true);
    expect(hit.y).toBe(-1);
  });
});
