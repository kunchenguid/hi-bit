# 3D platformer (run, jump, land on platforms)

A character that runs around, falls with gravity, and jumps onto blocks floating in 3D space.
3D Mario-style.
Build on `engine3d.js` and the loop in `world-loop.md`.

## The rules

1. The keys move the player on the ground plane (x and z).
2. Gravity pulls the player down (`-y`) every frame.
3. Jump only works when the player is standing on something.
4. `HiBit3D.moveAndCollide` moves the player one axis at a time and stops it against solids, so it lands on top and slides along walls instead of sinking through.

```js
const canvas = document.getElementById("game");
// step: 1 / 60 gives gravity and jumps the same feel on every machine.
const world = HiBit3D.createWorld(canvas, { background: "#a0c4ff" });

const GRAVITY = 30;     // units per second, per second
const MOVE_SPEED = 7;   // run speed on the ground
const JUMP_SPEED = 11;  // how hard the jump launches

const player = world.addBox({ x: 0, y: 6, z: 0, w: 1, h: 1.4, d: 1, color: "#ffd166" });
player.vy = 0;
player.onGround = false;

// the ground plus some platforms to jump between (top surface at y + h)
const solids = [
  world.addGround({ size: 40, color: "#52796f" }),       // top at y = 0
  world.addBox({ x: 4, y: 2, z: 0, w: 3, h: 0.5, d: 3, color: "#3d5a80" }),
  world.addBox({ x: 9, y: 4, z: -2, w: 3, h: 0.5, d: 3, color: "#3d5a80" }),
];

const { input } = HiBit3D.run(world, { update, step: 1 / 60 });

function update(dt) {
  // 1. move on the ground plane
  const dx = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
  const dz = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);

  // 2. jump only when standing
  if (input.wasPressed("jump") && player.onGround) player.vy = JUMP_SPEED;

  // 3. gravity
  player.vy -= GRAVITY * dt;

  // 4. move everything at once and let collide stop us; onGround comes back true on a landing
  const hit = HiBit3D.moveAndCollide(
    player,
    { x: dx * MOVE_SPEED * dt, y: player.vy * dt, z: dz * MOVE_SPEED * dt },
    solids,
  );
  if (hit.y !== 0) player.vy = 0;       // stop falling/rising when we hit something
  player.onGround = hit.onGround;

  // 5. fell off the world? back to the start
  if (player.y < -20) { player.x = 0; player.y = 6; player.z = 0; player.vy = 0; }

  HiBit3D.followCamera(world, player, { distance: 10, height: 7 });
}
```

## Why move-and-collide

`HiBit3D.moveAndCollide(entity, move, solids)` does the hard part: it moves the box along x, then z, then y, and after each axis pushes the box back out of anything it overlapped.
Landing on top of a solid sets `onGround` and returns `hit.y === -1`; bonking your head returns `hit.y === 1`.
You only have to zero out `vy` when `hit.y` is not 0.

## Add-ons, one at a time

- **Coins / pickups**: an array of small boxes or spheres; in `update`, if `HiBit3D.overlap(player, coin)` then hide its mesh (`coin.mesh.visible = false`), remove it from the array, and `score++`.
- **Moving platforms**: change a platform's `x` or `y` each frame; the player riding it is handled because collide pushes them out each tick.
- **Double jump**: count jumps since the last landing; allow a second one in the air.
- **Real look**: texture the platforms and the player's box with `generate_image` pictures via `world.texture(...)`.
