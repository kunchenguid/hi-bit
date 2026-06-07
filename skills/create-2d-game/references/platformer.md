# Platformer (run and jump)

A side view where the player runs left and right, falls with gravity, and jumps onto platforms. Mario-style.
Build on `engine.js` and the loop in `game-loop.md`.

## The rules

1. Left/right keys set the player's horizontal speed.
2. Gravity pulls the player down every frame.
3. Jump only works when the player is standing on something.
4. Move one axis at a time and stop against solid boxes - this is what makes the player land and not sink through.

```js
const canvas = document.getElementById("game");
// step: 1 / 60 gives gravity and jumps the same feel on every machine.
const { ctx, input } = HiBitGame.run(canvas, { update, draw, step: 1 / 60 });

const GRAVITY = 1800; // pixels per second, per second
const MOVE_SPEED = 220; // sideways speed
const JUMP_SPEED = 650; // how hard the jump launches

const player = { x: 40, y: 0, w: 32, h: 44, vx: 0, vy: 0, onGround: false };

// Solid ground and platforms the player stands on.
const solids = [
  { x: 0, y: 320, w: 640, h: 40 }, // floor
  { x: 180, y: 250, w: 120, h: 16 }, // platform
  { x: 380, y: 190, w: 120, h: 16 }, // platform
];

function update(dt) {
  // 1. sideways input
  player.vx = 0;
  if (input.isDown("left")) player.vx = -MOVE_SPEED;
  if (input.isDown("right")) player.vx = MOVE_SPEED;

  // 2. jump only when standing
  if (input.wasPressed("jump") && player.onGround) player.vy = -JUMP_SPEED;

  // 3. gravity
  player.vy += GRAVITY * dt;

  // 4. move X, then push out of any solid we hit
  player.x += player.vx * dt;
  for (const s of solids) {
    if (HiBitGame.overlap(player, s)) {
      if (player.vx > 0) player.x = s.x - player.w; // hit left side of solid
      else if (player.vx < 0) player.x = s.x + s.w; // hit right side
    }
  }

  // 5. move Y, then push out - landing on top sets onGround
  player.onGround = false;
  player.y += player.vy * dt;
  for (const s of solids) {
    if (HiBitGame.overlap(player, s)) {
      if (player.vy > 0) { player.y = s.y - player.h; player.onGround = true; } // landed
      else if (player.vy < 0) player.y = s.y + s.h; // bonked head
      player.vy = 0;
    }
  }
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#3d5a80";
  for (const s of solids) ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x, player.y, player.w, player.h);
}
```

## Side-scrolling camera

When the level is wider than the screen, follow the player by shifting everything left before you draw:

```js
function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const camX = Math.max(0, player.x - canvas.width / 2);
  ctx.save();
  ctx.translate(-camX, 0);
  // ...draw solids and player at their real x here...
  ctx.restore();
}
```

## Add-ons, one at a time

- **One-way platforms** (jump up through, land on top): only treat the platform as solid in step 5 when the player is moving down *and* was above it last frame (`player.y + player.h - player.vy * dt <= s.y`).
- **Coins / pickups**: an array of small boxes; in `update`, if `HiBitGame.overlap(player, coin)` then remove it, `score++`, and save the coin total or cleared level with `GameSave.save(...)`.
- **Falling off**: if `player.y > canvas.height + 100`, reset the player to the start.
- **Real character**: get the sprite from the game-assets skill (a walk and an idle), and draw it instead of the yellow box.
