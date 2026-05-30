# Collector (grab floating pickups before time runs out)

Move around a 3D world and grab pickups that float in the air, racing a timer for the best score.
Coin rush, star catch, gem hunt.
Build on `engine3d.js` and the loop in `world-loop.md`.

## The rules

1. The keys move the player around the ground.
2. Pickups are small bodies scattered in the world; touching one scores a point and removes it.
3. A round timer ends the game; show the score on an HTML overlay.

```html
<!-- in index.html, on top of the canvas -->
<div id="hud" style="position:fixed; top:10px; left:10px; color:#fff;
     font:20px sans-serif; text-shadow:0 1px 2px #000;"></div>
```

```js
const canvas = document.getElementById("game");
const hud = document.getElementById("hud");
const world = HiBit3D.createWorld(canvas, { background: "#90e0ef" });

const SPEED = 8;
const ROUND_TIME = 30; // seconds

const ground = world.addGround({ size: 50, color: "#80b918" });
const player = world.addBox({ x: 0, y: 0, z: 0, w: 1, h: 1.2, d: 1, color: "#ffd166" });

// scatter floating pickups
let coins = [];
function scatterCoins(n) {
  for (let i = 0; i < n; i++) {
    coins.push(world.addSphere({
      x: Math.random() * 40 - 20,
      y: 1,
      z: Math.random() * 40 - 20,
      r: 0.5,
      color: "#ffd60a",
    }));
  }
}
scatterCoins(15);

let score = 0;
let timeLeft = ROUND_TIME;

const { input } = HiBit3D.run(world, { update });

function update(dt) {
  if (timeLeft > 0) {
    timeLeft -= dt;

    let dx = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    let dz = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);
    if (dx !== 0 && dz !== 0) { dx *= Math.SQRT1_2; dz *= Math.SQRT1_2; }
    player.x += dx * SPEED * dt;
    player.z += dz * SPEED * dt;

    // spin the coins so they read as collectable, and check pickups
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.mesh.rotation.y += dt * 2;
      if (HiBit3D.overlap(player, c)) {
        c.mesh.visible = false;      // hide the mesh
        coins.splice(i, 1);          // drop it from the list
        score += 1;
      }
    }

    if (coins.length === 0) scatterCoins(15); // refill so there is always something to chase
  }

  HiBit3D.followCamera(world, player, { distance: 11, height: 8 });

  hud.textContent =
    timeLeft > 0
      ? `Score: ${score}   Time: ${Math.ceil(timeLeft)}`
      : `Time's up! Final score ${score} - press Space`;

  if (timeLeft <= 0 && input.wasPressed("action")) {
    score = 0; timeLeft = ROUND_TIME;       // restart
  }
}
```

## Variations from the same shape

- **Drive, do not walk**: make the player a flatter, wider box (a car) and turn with left/right, drive forward with up.
- **Dodge, do not collect**: make some bodies *bad* - if `HiBit3D.overlap(player, hazard)` is true, lose a life or time.
- **Verticality**: put coins on platforms at different heights and add gravity + jump from the platformer recipe.
- **Real look**: replace the coin spheres with a textured box (a gem picture from `generate_image`), or texture the ground.

## Click-to-collect (a pointer version)

If the game is point-and-click instead of walk-into, use `HiBit3D.pick`:

```js
if (input.pointer.clicked) {
  const hit = HiBit3D.pick(world, coins); // the coin under the mouse, or null
  if (hit) {
    hit.mesh.visible = false;
    coins = coins.filter((c) => c !== hit);
    score += 1;
  }
}
```
