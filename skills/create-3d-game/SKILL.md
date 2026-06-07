---
name: create-3d-game
description: Build the boilerplate of a real 3D game that runs right in the browser with Three.js - the scene, camera, lights, the game loop, keyboard and mouse-look input, 3D movement, gravity and jumping, box collision, and click-picking - for first-person and third-person worlds, blocky build-and-explore worlds, 3D platformers, collectors, and blasters. Use this whenever a creation should be a playable game set in 3D space, where you move and look around a world with depth, instead of a flat 2D game (use create-2d-game for those), a static page, a quiz, or a single picture.
---

# Create 3D game

Use this skill when a creation should be a real, playable game in 3D space: a world with depth that you move and look around, a character you steer in three dimensions, things you collect or shoot across a scene, a first-person or third-person view.

For a flat, side-on or top-down 2D game (platformer, top-down, clicker, shooter), use the **create-2d-game** skill instead - it is simpler and a better fit.
For a static page, a story, a quiz, or a single still picture, you do not need a game skill at all.

It gives you the boilerplate so you do not reinvent the scene setup, the loop, the input, and the collision every time.

## The one big idea: a scene you draw, and a loop that updates it

A 3D game has two halves:

1. **The scene** - a `THREE.Scene` holding meshes (boxes, spheres, the ground), lit by lights, viewed through a camera.
   You build it once.
2. **The loop** - the same heartbeat as a 2D game: every tick you **update** (read input, move things, check collisions), and the engine **draws** the scene through the camera for you.

You never animate by hand and you never call the renderer yourself.
You describe *how things change in one tick* inside `update(dt)`, and the loop runs that tick forever.
`dt` is the seconds since the last tick; multiply speeds by `dt` so the game runs the same on every machine.

## How to start any 3D game

1. Copy three files next to your game: `three.min.js`, `engine3d.js`, and your own `game.js`.
   Load them in this order in `index.html` (Three.js first, then the engine, then your game).
2. In `game.js`, call `HiBit3D.createWorld(canvas)` to get a lit scene, a camera, and a renderer.
   Then call `HiBit3D.run(world, { update })` to start the loop.
   Read `references/world-loop.md` for the exact skeleton - copy it first and get a box moving on the ground before anything else.
3. Build the world from primitives: `world.addBox`, `world.addSphere`, `world.addGround`.
   Each returns a body with a collider you can read and move; the box is the truth of the game, the mesh is what the builder sees.
4. Keep tunable numbers (speed, gravity, jump strength, spawn rate) as named constants at the top of `game.js` so the builder can find and change them.
5. Pick the kind of game that matches what the builder asked for and read that reference file:
   - `references/explorer-3d.md` - walk and look around a 3D world, first-person or third-person (Minecraft-walk, an explorable scene).
   - `references/platformer-3d.md` - run, jump, and land on platforms floating in 3D (3D Mario-style).
   - `references/collector-3d.md` - move around and grab floating pickups before a timer runs out.
   - `references/blaster-3d.md` - move and fire shots at targets across the scene, in waves.
6. Start the creation's preview so the builder can press Play.

## Art in 3D: textured primitives, from generate_image

This skill builds worlds out of **boxes, spheres, and planes** - bright, blocky, friendly shapes.
That is the whole look for now, and it is a good one: it reads clearly and a kid can change a color in one line.

When a surface needs a real picture - grass, brick, wood, a face on a block, a sky - use `generate_image` to draw a flat square image, save it under the creation (for example `assets/textures/grass.png`), and put it on a primitive with `world.texture()`.
If your job lists reference picture ids from the builder, pass them in `reference_paths` so the texture matches that character, colors, or style:

```js
const grass = world.texture("assets/textures/grass.png");
world.addGround({ size: 40, texture: grass });
```

Two rules:

- Never hand-draw a texture with shapes in code, and never try to build a character out of many tiny boxes to fake real art.
  Flat pictures come from `generate_image`, exactly like everywhere else in Hi-Bit.
- The **game-assets** skill (sprite sheets, `process_sprite_sheet`) is for 2D sprites and does **not** apply to 3D meshes here.
  In 3D you use plain `generate_image` textures on primitives, not sprite sheets.
  Real 3D models (downloaded or generated meshes) are not part of this skill - stay with textured primitives.

## Keep it kid-sized

- Build the smallest playable thing first - a box you can drive around a ground plane - then add to it.
  A builder who can move something in a 3D world in a minute stays excited.
- Use plain names: `player`, `ground`, `coins`, `gravity`. The builder reads this code.
- One new idea at a time. Get movement working, then the camera, then gravity and jumping, then pickups or enemies.
- Bright, friendly, age-appropriate. No gore or scary themes unless the builder clearly asked for something gentle-spooky.
- 3D is heavier than 2D. Keep the number of meshes modest (tens, not thousands) so the live preview stays smooth.

## Resources

- `references/three.min.js`: the Three.js library (MIT). Copy it into the creation. See `references/THREE-LICENSE.txt`.
- `references/engine3d.js`: the world setup, the loop, keyboard + mouse-look input, 3D box-overlap and move-and-collide, follow/first-person cameras, and click-picking. Copy it into the creation.
- `references/world-loop.md`: the universal 3D skeleton every game starts from.
- `references/explorer-3d.md`, `references/platformer-3d.md`, `references/collector-3d.md`, `references/blaster-3d.md`: one focused recipe per kind of game.
