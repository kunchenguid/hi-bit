# Explorer (walk and look around a 3D world)

A world you walk through and look around, first-person or third-person.
Ground, some walls and blocks to bump into, and a camera you steer.
Minecraft-walk, a museum, a little town to explore.
Build on `engine3d.js` and the loop in `world-loop.md`.

## The rules

1. The keys move the player; in first-person, the mouse turns the view and the player walks where they look.
2. Walls and blocks are solid boxes; the player slides along them instead of passing through.
3. The camera either follows behind (third-person) or sits in the player's head (first-person).

## Third-person explorer

The simplest one to start with - no mouse needed.

```js
const canvas = document.getElementById("game");
const world = HiBit3D.createWorld(canvas, { background: "#8ecae6" });

const SPEED = 7;

const ground = world.addGround({ size: 60, color: "#80b918" });
const player = world.addBox({ x: 0, y: 0, z: 0, w: 1, h: 1.6, d: 1, color: "#ffd166" });

// things to walk around
const walls = [
  world.addBox({ x: -6, y: 0, z: -6, w: 12, h: 2, d: 1, color: "#6d6875" }),
  world.addBox({ x: -6, y: 0, z: -6, w: 1, h: 2, d: 12, color: "#6d6875" }),
  world.addBox({ x: 8, y: 0, z: 2, w: 2, h: 2, d: 2, color: "#e07a5f" }),
];

const { input } = HiBit3D.run(world, { update });

function update(dt) {
  let dx = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
  let dz = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);
  if (dx !== 0 && dz !== 0) { dx *= Math.SQRT1_2; dz *= Math.SQRT1_2; } // even diagonals

  // move and stop against the walls (no gravity here, so y stays 0)
  HiBit3D.moveAndCollide(player, { x: dx * SPEED * dt, y: 0, z: dz * SPEED * dt }, walls);

  HiBit3D.followCamera(world, player, { distance: 9, height: 6 });
}
```

That is a whole explorer: a character that walks around a world and cannot walk through walls, with the camera trailing behind.

## First-person explorer

Add mouse-look and walk in the direction you are facing.

```js
const canvas = document.getElementById("game");
const world = HiBit3D.createWorld(canvas, { background: "#8ecae6" });

const SPEED = 6;

world.addGround({ size: 60, color: "#80b918" });
const player = world.addBox({ x: 0, y: 0, z: 0, w: 0.8, h: 1.7, d: 0.8, color: "#ffd166" });
const walls = [
  world.addBox({ x: -8, y: 0, z: -8, w: 16, h: 3, d: 1, color: "#6d6875" }),
  world.addBox({ x: 5, y: 0, z: 0, w: 2, h: 2, d: 2, color: "#e07a5f" }),
];

let cam = {}; // remembers where we are looking
const { input } = HiBit3D.run(world, { update });
input.lockPointer(canvas); // builder clicks the game once to capture the mouse

function update(dt) {
  cam = HiBit3D.firstPerson(world, player, cam); // aim the view with the mouse

  // walk relative to where we are looking (cam.yaw)
  const forward = (input.isDown("up") ? 1 : 0) - (input.isDown("down") ? 1 : 0);
  const strafe = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
  const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
  const move = {
    x: (-forward * sin + strafe * cos) * SPEED * dt,
    y: 0,
    z: (-forward * cos - strafe * sin) * SPEED * dt,
  };
  HiBit3D.moveAndCollide(player, move, walls);
}
```

The player's box stays hidden inside the camera, but it is what stops you at walls.

## Add-ons, one at a time

- **A bigger world**: add more boxes for buildings, trees (a brown box trunk plus a green box top), and steps. Keep the count modest so the preview stays smooth.
- **Real surfaces**: make grass, brick, and wood with `generate_image`, then `world.texture(...)` them onto the ground and blocks.
- **Doors and signs**: when `HiBit3D.overlap(player, trigger)` is true, show an HTML message or move the player to a new spot. Save unlocked doors, the last area, or placed blocks with `GameSave.save(...)` when they change.
- **Falling off**: if `player.y < -20`, set the player back to the start.
