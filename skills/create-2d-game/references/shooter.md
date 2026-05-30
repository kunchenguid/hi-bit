# Shooter (move, fire, waves of enemies)

The player moves and fires shots; enemies come in waves and get hit. A space shooter or a top-down blaster.
Build on `engine.js` and the loop in `game-loop.md`.

Keep it friendly: glowing orbs, bubbles, or friendly robots, not gore.

## The rules

1. The player moves with the keys.
2. Holding fire spawns a shot, but only every so often (a cooldown), so one tap is not a hundred shots.
3. Reuse shot objects instead of making new ones forever (a pool) - smoother and simpler to reason about.
4. A shot that hits an enemy removes both and adds score. Shots that fly off-screen are recycled.

```js
const canvas = document.getElementById("game");
// step: 1 / 60 keeps fast bullets from skipping past enemies on slow frames.
const { ctx, input } = HiBitGame.run(canvas, { update, draw, step: 1 / 60 });

const MOVE_SPEED = 260;
const BULLET_SPEED = 480;
const FIRE_COOLDOWN = 0.18; // seconds between shots while holding fire

const player = { x: 300, y: 320, w: 36, h: 24 };
const bullets = []; // pool: each { active, x, y, w, h }
const enemies = []; // each { alive, x, y, w, h }
let fireTimer = 0;
let score = 0;

// reuse an inactive bullet, or grow the pool by one
function getBullet() {
  let b = bullets.find((x) => !x.active);
  if (!b) { b = { active: false, x: 0, y: 0, w: 6, h: 14 }; bullets.push(b); }
  return b;
}

function spawnWave() {
  for (let i = 0; i < 6; i++) {
    enemies.push({ alive: true, x: 60 + i * 90, y: 40, w: 36, h: 28 });
  }
}
spawnWave();

function update(dt) {
  // move
  if (input.isDown("left")) player.x -= MOVE_SPEED * dt;
  if (input.isDown("right")) player.x += MOVE_SPEED * dt;
  player.x = Math.max(0, Math.min(canvas.width - player.w, player.x));

  // fire on a cooldown
  fireTimer -= dt;
  if (input.isDown("action") && fireTimer <= 0) {
    fireTimer = FIRE_COOLDOWN;
    const b = getBullet();
    b.active = true;
    b.x = player.x + player.w / 2 - b.w / 2;
    b.y = player.y;
  }

  // move bullets, recycle when off the top
  for (const b of bullets) {
    if (!b.active) continue;
    b.y -= BULLET_SPEED * dt;
    if (b.y + b.h < 0) b.active = false;
  }

  // bullet vs enemy
  for (const b of bullets) {
    if (!b.active) continue;
    for (const e of enemies) {
      if (e.alive && HiBitGame.overlap(b, e)) {
        b.active = false;
        e.alive = false;
        score += 1;
      }
    }
  }

  // next wave when the screen is clear
  if (enemies.every((e) => !e.alive)) {
    enemies.length = 0;
    spawnWave();
  }
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = "#06d6a0";
  for (const b of bullets) if (b.active) ctx.fillRect(b.x, b.y, b.w, b.h);

  ctx.fillStyle = "#ef476f";
  for (const e of enemies) if (e.alive) ctx.fillRect(e.x, e.y, e.w, e.h);

  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.fillText("Score: " + score, 12, 28);
}
```

## Add-ons, one at a time

- **Enemies that move**: slide the whole wave side to side, or drift it downward each wave.
- **Enemies shoot back**: give enemies their own bullet pool moving downward; if one overlaps the player, lose a life.
- **Lives and game over**: track `lives`; at zero switch to an "over" scene (see `game-loop.md`).
- **Real art**: the game-assets skill makes the ship, the enemy, and a glowing projectile (use `fit` for the projectile). Draw the sprite at each object's `x, y`; the box stays the hitbox.

## Why the pool

Spawning and throwing away hundreds of bullet objects makes the browser stutter. Keeping a fixed set and flipping `active` on and off keeps the game smooth and the code easy to follow.
