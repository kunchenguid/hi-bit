# Prompt rules

Patterns for writing sprite-sheet prompts by hand.
Always keep the strict parts in every prompt: solid flat magenta `#FF00FF` background, the exact grid, same character and same size in every cell, the whole subject inside its cell with margin, nothing crossing a cell edge, and no text or labels.
Keep the art friendly and age-appropriate for kids by default.

## Quick pattern

1. State the asset and the grid: "an even 2x2 grid, 4 equal cells".
2. Describe the character once: who it is, its colors, its simple readable shape.
3. Describe the motion cell by cell.
4. Restate: same character, same size, centered in every cell, nothing crosses a cell edge.
5. Restate: solid flat magenta `#FF00FF` background, no text, no labels.

## Walk (side view, 2x2)

A friendly [character] walking, drawn as an even 2x2 grid of 4 equal cells on a solid flat magenta `#FF00FF` background.
Top-left: standing, feet together.
Top-right: left foot stepping forward.
Bottom-left: standing, feet together.
Bottom-right: right foot stepping forward.
Same character, same bright colors, same size, centered in every cell with magenta margin all around.
Only the legs and arms move; nothing crosses a cell edge.
No borders between cells, no text, no labels.

## Idle (2x2)

A friendly [character] idle animation, even 2x2 grid of 4 equal cells, solid flat magenta `#FF00FF` background.
A calm standing pose with a small gentle bounce or breath across the four cells, looping back to the start.
Same character, same size, centered, nothing crossing a cell edge, no text.

## Jump (2x2)

A friendly [character] jumping, even 2x2 grid of 4 equal cells, solid flat magenta `#FF00FF` background.
Cell 1: crouch ready.
Cell 2: pushing off the ground.
Cell 3: up in the air, arms and legs tucked.
Cell 4: coming down, legs reaching for the ground.
Same character, same size, centered, nothing crossing a cell edge, no text.

## Attack or action (2x3)

A friendly [character] doing a [swing / throw / wave], even 2x3 grid of 6 equal cells, solid flat magenta `#FF00FF` background.
Read the cells left to right as wind-up, action, and settle back.
Keep any tool or effect close to the body so the cell size stays the same as the idle.
Same character, same size, centered, nothing crossing a cell edge, no text.

## Projectile (2x2, process with fit)

A small [glowing orb / star / bubble] projectile, even 2x2 grid of 4 equal cells, solid flat magenta `#FF00FF` background.
Same shape and same size in every cell; only the inner glow or sparkle changes so it loops.
Centered, glow stays inside the cell, no text.

## Icon or pickup (single, process with fit)

A single [coin / heart / key] game icon centered on a solid flat magenta `#FF00FF` background, with magenta margin all around.
Clear simple readable shape, bright colors, no text, no shadow.

## Four-direction walk (4x4)

A friendly [character] walk cycle for a top-down game, even 4x4 grid of 16 equal cells, solid flat magenta `#FF00FF` background.
Row 1 faces down, row 2 faces left, row 3 faces right, row 4 faces up.
Columns are: feet together, left foot forward, feet together, right foot forward.
Identical character, identical size in all 16 cells; only pose and facing change; nothing crosses a cell edge; no text.
