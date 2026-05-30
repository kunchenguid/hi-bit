# Clicker / arcade (one screen, points, timer)

One screen where things appear and the player clicks them (or dodges them) for points before time runs out. Whack-a-mole, catch-the-falling-stars, dodge-the-blocks.
Build on `engine.js` and the loop in `game-loop.md`.

## The rules

1. A timer counts spawns; every so often a new target appears.
2. Targets move (or just sit and disappear after a while).
3. When the pointer clicks a target, score goes up and the target is removed.
4. A round timer ends the game.

```js
const canvas = document.getElementById("game");
const { ctx, input } = HiBitGame.run(canvas, { update, draw });

const SPAWN_EVERY = 0.7; // seconds between new targets
const FALL_SPEED = 150; // how fast targets fall
const ROUND_TIME = 30; // seconds per round

let score = 0;
let timeLeft = ROUND_TIME;
let spawnTimer = 0;
const targets = []; // each: { x, y, w, h }

function spawn() {
  const size = 44;
  targets.push({ x: Math.random() * (canvas.width - size), y: -size, w: size, h: size });
}

function update(dt) {
  if (timeLeft <= 0) return; // round over - freeze

  timeLeft -= dt;
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_EVERY) { spawnTimer = 0; spawn(); }

  const click = input.pointer; // { x, y, clicked }
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    t.y += FALL_SPEED * dt;

    // a 1x1 box at the pointer is the easiest way to test a click hit
    if (click.clicked && HiBitGame.overlap({ x: click.x, y: click.y, w: 1, h: 1 }, t)) {
      targets.splice(i, 1);
      score += 1;
      continue;
    }
    if (t.y > canvas.height) targets.splice(i, 1); // missed, fell off
  }
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ef476f";
  for (const t of targets) ctx.fillRect(t.x, t.y, t.w, t.h);

  ctx.fillStyle = "#fff";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Score: " + score, 12, 28);
  ctx.fillText("Time: " + Math.max(0, Math.ceil(timeLeft)), 12, 54);
  if (timeLeft <= 0) {
    ctx.textAlign = "center";
    ctx.fillText("Time's up! Final score " + score, canvas.width / 2, canvas.height / 2);
  }
}
```

## Variations from the same shape

- **Whack-a-mole**: targets do not fall; instead each gets a small `life` timer and disappears on its own if not clicked.
- **Catch, do not click**: replace the click test with a paddle box the player moves with the mouse or arrows; `HiBitGame.overlap(paddle, t)` catches.
- **Dodge**: count overlaps as *bad* - if a falling block hits the player box, lose a life instead of scoring.
- **Restart**: when `timeLeft <= 0`, let `input.wasPressed("action")` reset `score`, `timeLeft`, and `targets`.

## Real art

Swap the rectangles for pickup/target sprites from the game-assets skill (use the `fit` strategy for icons and pickups). Draw each sprite at the target's `x, y`; the box stays the click target.
