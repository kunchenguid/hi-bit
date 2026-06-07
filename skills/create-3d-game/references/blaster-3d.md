# Blaster (move, fire, waves of targets in 3D)

The player moves and fires shots forward; targets come in waves and pop when hit.
A friendly 3D shooting gallery or a space blaster.
Build on `engine3d.js` and the loop in `world-loop.md`.

Keep it friendly: glowing orbs, bubbles, or friendly robots, not gore.

## The rules

1. The player moves with the keys.
2. Holding fire spawns a shot, but only every so often (a cooldown), so one tap is not a hundred shots.
3. Reuse shot objects instead of making new ones forever (a pool) - smoother and simpler.
4. A shot that hits a target removes both and adds score. Shots that fly off into the distance are recycled.

```js
const canvas = document.getElementById("game");
const hud = document.getElementById("hud"); // an HTML overlay div, like the collector
// step: 1 / 60 keeps fast shots from skipping past targets on slow frames.
const world = HiBit3D.createWorld(canvas, { background: "#03071e" });

const MOVE_SPEED = 10;
const SHOT_SPEED = 30;
const FIRE_COOLDOWN = 0.18; // seconds between shots while holding fire

const player = world.addBox({ x: 0, y: 1, z: 14, w: 1.5, h: 1, d: 2, color: "#ffd166" });
const shots = [];   // pool: each is a body with an `active` flag
const targets = []; // each is a body with an `alive` flag
let fireTimer = 0;
GameSave.namespace("blaster-3d");
let best = GameSave.load("best", 0);
let score = 0;

function getShot() {
  let s = shots.find((x) => !x.active);
  if (!s) {
    s = world.addSphere({ x: 0, y: -100, z: 0, r: 0.25, color: "#06d6a0" });
    s.active = false;
    shots.push(s);
  }
  return s;
}

function spawnWave() {
  for (let i = 0; i < 6; i++) {
    const t = world.addBox({ x: -10 + i * 4, y: 1, z: -12, w: 1.5, h: 1.5, d: 1.5, color: "#ef476f" });
    t.alive = true;
    targets.push(t);
  }
}
spawnWave();

const { input } = HiBit3D.run(world, { update, step: 1 / 60 });

function update(dt) {
  // move left/right
  if (input.isDown("left")) player.x -= MOVE_SPEED * dt;
  if (input.isDown("right")) player.x += MOVE_SPEED * dt;
  player.x = Math.max(-14, Math.min(14, player.x));

  // fire on a cooldown, shooting forward (-z, away from the camera)
  fireTimer -= dt;
  if (input.isDown("action") && fireTimer <= 0) {
    fireTimer = FIRE_COOLDOWN;
    const s = getShot();
    s.active = true;
    s.mesh.visible = true;
    s.x = player.x; s.y = player.y; s.z = player.z;
  }

  // move shots, recycle when far away
  for (const s of shots) {
    if (!s.active) continue;
    s.z -= SHOT_SPEED * dt;
    if (s.z < -40) { s.active = false; s.mesh.visible = false; }
  }

  // shot vs target
  for (const s of shots) {
    if (!s.active) continue;
    for (const t of targets) {
      if (t.alive && HiBit3D.overlap(s, t)) {
        s.active = false; s.mesh.visible = false;
        t.alive = false; t.mesh.visible = false;
        score += 1;
        if (score > best) { best = score; GameSave.save("best", best); }
      }
    }
  }

  // next wave when the screen is clear
  if (targets.every((t) => !t.alive)) {
    for (const t of targets) world.scene.remove(t.mesh);
    targets.length = 0;
    spawnWave();
  }

  HiBit3D.followCamera(world, player, { distance: 8, height: 5 });
  if (hud) hud.textContent = "Score: " + score + "  Best: " + best;
}
```

## Add-ons, one at a time

- **Targets that move**: drift the whole wave side to side, or float it slowly toward the player.
- **Targets shoot back**: give targets their own shot pool moving toward the player; if one overlaps the player, lose a life.
- **Lives and game over**: track `lives`; at zero switch to an "over" scene and let `input.wasPressed("action")` restart.
- **Aim with the mouse**: use first-person look (see `world-loop.md`) and fire shots in the direction the camera faces.
- **Saving**: save the best score, unlocked weapons, or highest wave with `GameSave.save(...)` when they change.
- **Real look**: texture the ship and the targets with `generate_image` pictures via `world.texture(...)`.

## Why the pool

Making and throwing away hundreds of shot meshes makes the browser stutter, and in 3D each mesh is heavier than a 2D rectangle.
Keeping a fixed set and flipping `active` (and `mesh.visible`) on and off keeps the game smooth and the code easy to follow.
