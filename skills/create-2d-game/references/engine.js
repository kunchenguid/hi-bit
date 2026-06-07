// engine.js - tiny no-library helpers for a 2D game in the browser.
// Pairs with sprite-renderer.js. Drop this file next to your game and add
// <script src="engine.js"></script> before your game script.
//
// It gives you three things:
//   HiBitGame.run(canvas, { update, draw })  - a game loop with delta time
//   HiBitGame.input                          - keyboard + pointer state
//   HiBitGame.overlap(a, b)                  - do two boxes touch (AABB)
//
// A box is any object with x, y, w, h (top-left corner, width, height).

const HiBitGame = (() => {
  const held = new Set(); // keys held down right now
  const pressed = new Set(); // keys that went down this frame
  const pointer = { x: 0, y: 0, down: false, clicked: false };

  // Action names you ask about, mapped to the keys that trigger them.
  // Override or extend with HiBitGame.input.setKeys({ ... }).
  let actionKeys = {
    left: ["ArrowLeft", "a", "A"],
    right: ["ArrowRight", "d", "D"],
    up: ["ArrowUp", "w", "W"],
    down: ["ArrowDown", "s", "S"],
    jump: [" ", "ArrowUp", "w", "W"],
    action: [" ", "Enter", "z", "Z"],
  };

  function isTextEntryTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function isGameplayKey(key) {
    return Object.values(actionKeys).some((keys) => keys.includes(key));
  }

  window.addEventListener("keydown", (e) => {
    if (isGameplayKey(e.key) && !isTextEntryTarget(e.target) && e.preventDefault) e.preventDefault();
    if (!held.has(e.key)) pressed.add(e.key);
    held.add(e.key);
  });
  window.addEventListener("keyup", (e) => held.delete(e.key));

  const input = {
    // True while the action's key is held.
    isDown(action) {
      return (actionKeys[action] || [action]).some((k) => held.has(k));
    },
    // True only on the single frame the key first goes down (for jump, shoot, start).
    wasPressed(action) {
      return (actionKeys[action] || [action]).some((k) => pressed.has(k));
    },
    pointer,
    setKeys(map) {
      actionKeys = { ...actionKeys, ...map };
    },
  };

  function attachPointer(canvas) {
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) * (canvas.width / r.width);
      pointer.y = (e.clientY - r.top) * (canvas.height / r.height);
    };
    canvas.addEventListener("mousemove", toLocal);
    canvas.addEventListener("mousedown", (e) => {
      toLocal(e);
      pointer.down = true;
      pointer.clicked = true;
    });
    window.addEventListener("mouseup", () => {
      pointer.down = false;
    });
  }

  // Start the loop.
  //   update(dt) gets the seconds since the last update; draw(ctx) paints.
  //   maxDt caps the time handled in one frame. This is the safety guard: after
  //     a tab-switch or a slow frame, the extra time is dropped instead of being
  //     caught up, so the loop can never spiral into running update() forever.
  //   step (optional, seconds): turn on a fixed timestep. update() then runs a
  //     whole number of times with this exact dt every frame, so movement and
  //     jumping feel the same on fast and slow machines. Your update code does
  //     not change - it still uses dt. Good for platformers and shooters
  //     (step: 1 / 60). Leave it out for a simple variable-rate loop.
  // Returns { ctx, input, stop }. Call stop() to end the loop - to restart a
  // game, or to clean up when the creation closes.
  function run(canvas, { update, draw, maxDt = 0.05, step = 0 } = {}) {
    const ctx = canvas.getContext("2d");
    attachPointer(canvas);
    let last = null;
    let leftover = 0; // unsimulated time carried to the next frame (fixed step only)
    let raf = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame); // reschedule first so stop() can cancel mid-frame
      if (last === null) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > maxDt) dt = maxDt;

      let consumedEdgeInputs = !update;
      if (update) {
        if (step > 0) {
          // dt is already capped at maxDt, so leftover grows by at most maxDt
          // per frame and this loop runs only a few times - never forever.
          leftover += dt;
          while (leftover >= step) {
            update(step);
            leftover -= step;
            consumedEdgeInputs = true;
          }
        } else {
          update(dt);
          consumedEdgeInputs = true;
        }
      }

      if (consumedEdgeInputs) {
        pressed.clear(); // edge presses last exactly one frame
        pointer.clicked = false;
      }
      if (draw) draw(ctx);
    }

    raf = requestAnimationFrame(frame);
    return {
      ctx,
      input,
      stop() {
        running = false;
        cancelAnimationFrame(raf);
      },
    };
  }

  // Do two boxes overlap? Used for every collision check.
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  return { run, input, overlap };
})();

// GameSave - remember the builder's progress between visits.
//
// A game with no memory forgets the score, the level, and everything the builder
// earned the moment they leave. Save it. GameSave uses the browser's localStorage,
// so it works the same wherever the game is opened - inside Hi-Bit, or shared out
// on a real website - with no server and no setup.
//
//   GameSave.namespace("maze");          // once, so two games never mix saves
//   GameSave.save("progress", { level: 3, coins: 12 });
//   const saved = GameSave.load("progress", { level: 1, coins: 0 }); // fallback if none yet
//
// Save whenever something worth keeping changes (level up, new high score), and
// load once when the game starts. Values can be any JSON: numbers, strings,
// arrays, objects. save() returns false if storage is blocked (it never throws).
const GameSave = (() => {
  let prefix = "game:"; // change with namespace() so each game gets its own keys
  const keyFor = (name) => prefix + (name || "save");
  return {
    // Call once with your game's name so its saves stay separate from other games.
    namespace(name) {
      if (name) prefix = `${name}:`;
    },
    // Read the saved value for `name`, or `fallback` if nothing is saved yet.
    load(name, fallback = null) {
      try {
        const raw = localStorage.getItem(keyFor(name));
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    // Save any JSON-able value under `name`. Returns true if it was stored.
    save(name, value) {
      try {
        localStorage.setItem(keyFor(name), JSON.stringify(value));
        return true;
      } catch {
        return false; // storage full, blocked, or unavailable (e.g. some file:// modes)
      }
    },
    // Forget a saved value.
    clear(name) {
      try {
        localStorage.removeItem(keyFor(name));
      } catch {}
    },
  };
})();
