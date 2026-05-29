# The game loop skeleton

Every genre starts from this. Copy `engine.js` next to your game, then build from here.

## The smallest whole game

`index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; background: #10131a; }
      canvas { display: block; margin: 0 auto; background: #1b2030; }
    </style>
  </head>
  <body>
    <canvas id="game" width="640" height="360"></canvas>
    <script src="engine.js"></script>
    <script src="game.js"></script>
  </body>
</html>
```

`game.js`:

```js
const canvas = document.getElementById("game");
const { ctx, input } = HiBitGame.run(canvas, { update, draw });

// Tunable numbers live here so they are easy to find and change.
const SPEED = 200; // pixels per second

const player = { x: 300, y: 160, w: 32, h: 32 };

function update(dt) {
  if (input.isDown("left")) player.x -= SPEED * dt;
  if (input.isDown("right")) player.x += SPEED * dt;
  if (input.isDown("up")) player.y -= SPEED * dt;
  if (input.isDown("down")) player.y += SPEED * dt;
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x, player.y, player.w, player.h);
}
```

That is a complete, playable game: a square you move with the arrow keys or WASD. Everything else is more rules inside `update` and more drawing inside `draw`.

## The pieces you will reuse

**Delta time.** `update(dt)` gets the seconds since the last frame. Always move by `speed * dt`, never by a flat number, so the game feels the same everywhere.

**Input.** From `engine.js`:
- `input.isDown("left")` - true while held. Use for movement.
- `input.wasPressed("jump")` - true for one frame when first pressed. Use for jump, shoot, start, pause.
- `input.pointer` - `{ x, y, down, clicked }` in canvas coordinates. `clicked` is true for one frame.

**Collision.** `HiBitGame.overlap(a, b)` is true when two boxes touch. A box is `{ x, y, w, h }`. This one check powers landing on platforms, getting hit, picking things up, and clicking targets.

**Stopping the loop.** `run` returns a `stop` function. Use it to clean up before a restart, or when leaving the game:

```js
const game = HiBitGame.run(canvas, { update, draw });
// later, to restart cleanly:
game.stop();
// ...reset your score/player/enemies, then call HiBitGame.run again.
```

**The safety clamp.** `run` never tries to "catch up" after the tab was in the background or a frame ran slow - it caps the time handled per frame (`maxDt`, default 0.05s) and drops the rest. That one rule is what keeps the loop from freezing the browser. You do not need to do anything; just know that a long pause resumes smoothly instead of fast-forwarding.

**Steady physics (optional).** Pass `step` to make movement feel identical on fast and slow machines, which matters once you have gravity or fast-moving things:

```js
HiBitGame.run(canvas, { update, draw, step: 1 / 60 });
```

With `step`, the engine calls `update` a whole number of times per frame with the same dt each time. Your `update(dt)` code does not change at all. Use it for platformers and shooters; for simple movement and clickers you can leave it out.

## Scenes (title -> playing -> game over)

Hold the current scene in a variable and branch on it. This keeps a start screen and a game-over screen simple:

```js
let scene = "title"; // "title" | "playing" | "over"
let score = 0;

function update(dt) {
  if (scene === "title") {
    if (input.wasPressed("action")) { scene = "playing"; score = 0; }
    return;
  }
  if (scene === "over") {
    if (input.wasPressed("action")) scene = "title";
    return;
  }
  // scene === "playing": the real game updates here
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (scene === "title") { drawCenteredText("Press Space to start"); return; }
  if (scene === "over") { drawCenteredText("Game over - score " + score); return; }
  // draw the playing scene
}

function drawCenteredText(text) {
  ctx.fillStyle = "#fff";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}
```

## Drawing the real sprite

While building, draw the player as a rectangle so you can see the rules working. When the real art is ready (from the game-assets skill), load it once and draw it each frame at the same `x, y`:

```js
let hero;
HiBitSprite.load("assets/sprites/hero/sprite-meta.json").then((s) => { hero = s; });

function update(dt) {
  // ...move player...
  if (hero) hero.update(dt * 1000); // sprite-renderer wants milliseconds
}

function draw(ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (hero) hero.draw(ctx, player.x, player.y);
  else { ctx.fillStyle = "#ffd166"; ctx.fillRect(player.x, player.y, player.w, player.h); }
}
```

The box `{ x, y, w, h }` stays the truth of the game (movement, collision). The sprite is only what the builder sees on top of it.
