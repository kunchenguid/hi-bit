# Top-down (walk around a world)

A bird's-eye view where the player walks in four directions. No gravity. Zelda-style.
Build on `engine.js` and the loop in `game-loop.md`.

## The rules

1. Each arrow/WASD key pushes the player in its direction.
2. Diagonals are normalized so moving diagonally is not faster than moving straight.
3. Walls are solid boxes; move one axis at a time and stop against them, just like the platformer but with no gravity.

```js
const canvas = document.getElementById("game");
const { ctx, input } = HiBitGame.run(canvas, { update, draw });

const SPEED = 180;

const player = { x: 300, y: 160, w: 30, h: 30 };

const walls = [
  { x: 100, y: 100, w: 140, h: 24 },
  { x: 100, y: 100, w: 24, h: 160 },
  { x: 420, y: 80, w: 24, h: 200 },
];

function update(dt) {
  // direction from the keys: -1, 0, or 1 on each axis
  let dx = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
  let dy = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);

  // keep diagonal speed equal to straight speed
  if (dx !== 0 && dy !== 0) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }

  // move X, push out of walls
  player.x += dx * SPEED * dt;
  for (const w of walls) {
    if (HiBitGame.overlap(player, w)) {
      if (dx > 0) player.x = w.x - player.w;
      else if (dx < 0) player.x = w.x + w.w;
    }
  }

  // move Y, push out of walls
  player.y += dy * SPEED * dt;
  for (const w of walls) {
    if (HiBitGame.overlap(player, w)) {
      if (dy > 0) player.y = w.y - player.h;
      else if (dy < 0) player.y = w.y + w.h;
    }
  }
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#52796f";
  for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x, player.y, player.w, player.h);
}
```

## Depth: draw far things first

So the player walks *in front of* things lower on the screen and *behind* things higher up, sort everything by the bottom of its box before drawing:

```js
const things = [player, ...npcs, ...trees];
things.sort((a, b) => (a.y + a.h) - (b.y + b.h));
for (const t of things) drawThing(ctx, t);
```

## Add-ons, one at a time

- **A bigger world + camera**: keep the world larger than the canvas and `ctx.translate(-camX, -camY)` where the camera centers on the player (clamp so it stops at the edges).
- **Pickups / doors**: small boxes; `HiBitGame.overlap(player, item)` triggers picking up, opening, or moving to the next room.
- **Four-facing character**: the game-assets skill makes a 4x4 walk sprite (down, left, right, up). Pick the row from the last direction the player pressed, and draw it instead of the box.
