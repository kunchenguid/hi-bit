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
