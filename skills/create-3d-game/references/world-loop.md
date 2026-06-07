# The 3D world + loop skeleton

Every 3D game starts from this.
Copy `three.min.js` and `engine3d.js` next to your game, then build from here.

## The smallest whole 3D game

`index.html` - load Three.js, then the engine, then your game, in that order:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #10131a; }
      canvas { display: block; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script src="three.min.js"></script>
    <script src="engine3d.js"></script>
    <script src="game.js"></script>
  </body>
</html>
```

`game.js`:

```js
const canvas = document.getElementById("game");
resizeCanvas();

const world = HiBit3D.createWorld(canvas, { background: "#8ecae6" });
window.addEventListener("resize", () => {
  resizeCanvas();
  world.camera.aspect = canvas.width / canvas.height;
  world.camera.updateProjectionMatrix();
  world.renderer.setSize(canvas.width, canvas.height, false);
});

// Tunable numbers live here so they are easy to find and change.
const SPEED = 8; // units per second

const ground = world.addGround({ size: 40, color: "#52796f" });
const player = world.addBox({ x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, color: "#ffd166" });

const { input } = HiBit3D.run(world, { update });

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function update(dt) {
  if (input.isDown("left")) player.x -= SPEED * dt;
  if (input.isDown("right")) player.x += SPEED * dt;
  if (input.isDown("up")) player.z -= SPEED * dt; // "up" walks away from the camera
  if (input.isDown("down")) player.z += SPEED * dt;

  HiBit3D.followCamera(world, player); // keep the camera behind the player
}
```

That is a complete, playable 3D game: a yellow box you drive around a green ground with the arrow keys or WASD, with the camera following.
Everything else is more rules inside `update` and more things added to the world.

## The pieces you will reuse

**The world.** `HiBit3D.createWorld(canvas, { background, fog })` gives you `{ scene, camera, renderer, ... }` already lit.
Add things with `world.addBox`, `world.addSphere`, and `world.addGround`.

**Bodies and the box.** Every `add...` returns a *body*.
A body has a mesh (what is drawn) and a collider box `{ x, y, z, w, h, d }` (the truth of the game).
`x, y, z` is the box's near-bottom-left corner; `w, h, d` is its size.
Set `player.x`/`player.y`/`player.z` to move it - the mesh follows automatically.
`y` is up: bigger `y` is higher.

**Delta time.** `update(dt)` gets the seconds since the last frame. Always move by `speed * dt`.

**Input.** From `engine3d.js` (the same names as the 2D engine):
- `input.isDown("left")` - true while held. Use for movement.
- `input.wasPressed("jump")` - true for one frame. Use for jump, shoot, start.
- `input.pointer` - `{ x, y, down, clicked }` in canvas pixels. `clicked` is true for one frame. Use with `HiBit3D.pick`.
- `input.look` - `{ dx, dy }` mouse-look movement since the last update, after you turn it on (see first-person below).

**Cameras.**
- `HiBit3D.followCamera(world, target, { distance, height })` - third-person, stays behind and above the target.
- `HiBit3D.firstPerson(world, target, state)` - eyes-in-the-head view aimed by the mouse. Returns the `state` to pass back next frame.

**Collision.** `HiBit3D.overlap(a, b)` is true when two boxes touch in 3D.
`HiBit3D.moveAndCollide(entity, { x, y, z }, solids)` moves a box by that amount, one axis at a time, and stops it against the solids - this is how you walk into walls and land on the ground (see the platformer recipe).

**Stopping the loop.** `run` returns a `stop` function. Use it to clean up before a restart, or when leaving the game:

```js
const game = HiBit3D.run(world, { update });
// later, to restart cleanly:
game.stop();
```

**The safety clamp and steady physics.** Just like the 2D engine: `run` caps the time handled per frame (`maxDt`, default 0.05s) so a long pause resumes smoothly, and you can pass `step` for a fixed timestep when you have gravity or fast things:

```js
HiBit3D.run(world, { update, step: 1 / 60 });
```

Use `step` for platformers and blasters; for simple walking you can leave it out.

## First-person look

To look around with the mouse, turn on pointer lock once and aim the camera each frame:

```js
let camState = {}; // remembers yaw and pitch between frames
input.lockPointer(canvas); // the builder clicks the game once to capture the mouse

function update(dt) {
  camState = HiBit3D.firstPerson(world, player, camState);
  // ...move the player relative to camState.yaw if you want walk-where-you-look...
}
```

The browser captures the mouse when the builder clicks the game, and releases it when they press Esc.

## Scenes (title -> playing -> game over)

Hold the current scene in a variable and branch on it, exactly like the 2D engine:

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
```

Draw titles and scores with a plain HTML overlay (a `<div>` on top of the canvas) - that is easier to read than text in 3D.

## Putting a real picture on a surface

While building, use flat colors.
When a surface needs real art, make it with `generate_image` and load it as a texture.
If your job lists reference picture ids from the builder, pass them in `reference_paths` so the texture matches that character, colors, or style:

```js
const grass = world.texture("assets/textures/grass.png");
world.addGround({ size: 40, texture: grass });

const brick = world.texture("assets/textures/brick.png");
world.addBox({ x: 4, y: 0, z: 0, w: 2, h: 2, d: 2, texture: brick });
```

The box `{ x, y, z, w, h, d }` stays the truth of the game; the texture is only what the builder sees.
