---
name: create-2d-game
description: Build the boilerplate of a real 2D game that runs right in the browser - the game loop, player movement, keyboard and mouse input, collision, and scenes - for platformers, top-down games, clicker/arcade games, and shooters. Use this whenever a creation should be a playable game with something that moves and is controlled, instead of a static page, a quiz, or a single picture.
---

# Create 2D game

Use this skill when a creation should be a real, playable 2D game: a character that moves, a thing the builder controls, score, enemies, or anything with a game loop.
It gives you the boilerplate so you do not reinvent the loop, the input, and the collision every time.

For a static page, a story, a quiz, or a single still picture, you do not need this skill.

## The one big idea: a loop that updates, then draws

Every 2D game is the same heartbeat, many times a second:

1. **Update** - read the input, move things, check collisions, change the score.
2. **Draw** - clear the canvas and paint everything where it now is.

You never animate by hand. You describe *how things change in one tick*, and the loop runs that tick forever. The time since the last tick is `dt` (in seconds); multiply speeds by `dt` so the game runs the same on fast and slow machines.

## How to start any game

1. Make a `<canvas>` and copy `references/engine.js` next to your game file.
2. Use the loop, input, and collision helpers from `engine.js` instead of writing your own. Read `references/game-loop.md` for the skeleton.
3. Keep tunable numbers (speed, gravity, spawn rate, score) as named constants at the top of your game file so the builder can find and change them.
4. Pick the genre that matches what the builder asked for and read that reference file:
   - `references/platformer.md` - run, jump, stand on platforms, side-scrolling (Mario-style).
   - `references/top-down.md` - walk in four directions around a world, no gravity (Zelda-style).
   - `references/clicker-arcade.md` - one screen, click or dodge things for points, with a timer.
   - `references/shooter.md` - move a ship, fire shots, waves of enemies.
5. Start the creation's preview so the builder can press Play.

## Real art comes from the game-assets skill

This skill handles the *moving parts* - the loop, the rules, the collisions. It does not draw the art.
The moment the game needs a character, creature, enemy, projectile, or any picture that moves or needs a see-through background, switch to the **game-assets** skill: it makes the sprite with `generate_image` and `process_sprite_sheet`, and `sprite-renderer.js` draws it.

So the normal flow for a game with a character is:

1. `create-2d-game` for the loop and rules (start with a plain colored rectangle as the player).
2. `game-assets` for the real sprite.
3. Swap the rectangle for the sprite: where you drew a box, call the sprite's `draw(ctx, x, y)` instead. The box's `x, y, w, h` stay the rules of the game; the sprite is just what the builder sees.

Never hand-draw a character with shapes in code. Boxes are fine while you build the rules; finished art comes from game-assets.

## Saving progress

A game that forgets the score and the level every time the builder leaves feels broken to a kid.
If the game has anything worth keeping - a high score, the current level, coins, unlocked things - save it.

`engine.js` gives you `GameSave` for exactly this. It uses the browser's `localStorage`, so the save works the same wherever the game is opened: inside Hi-Bit, or shared out on a real website later. No server, no setup.

1. Once, near the top of your game, give the game a name so its save stays separate from other games: `GameSave.namespace("maze")`.
2. When the game starts, load what was saved (with a fallback for the very first visit): `const saved = GameSave.load("progress", { level: 1, best: 0 })`.
3. Whenever something worth keeping changes - a level cleared, a new high score - save it: `GameSave.save("progress", { level, best })`.

Save the small facts you need to restart where the builder left off, not the whole game state every frame.
Values can be any JSON (numbers, strings, arrays, objects). `GameSave.save` never throws - it returns `false` if storage is blocked, which a game can simply ignore.

## Keep it kid-sized

- Build the smallest playable thing first - a player that moves and one rule - then add to it. A builder who can move something in 30 seconds stays excited.
- Use plain names: `player`, `enemies`, `score`, `gravity`. The builder reads this code.
- One new idea at a time. Get movement working, then jumping, then platforms, then enemies.
- Bright, friendly, age-appropriate. No gore or scary themes unless the builder clearly asked for something gentle-spooky.

## Resources

- `references/engine.js`: the loop, keyboard/mouse input, the box-overlap helper, and `GameSave` for saving progress. Copy it into the creation.
- `references/game-loop.md`: the universal skeleton every genre starts from.
- `references/platformer.md`, `references/top-down.md`, `references/clicker-arcade.md`, `references/shooter.md`: one focused recipe per genre.
