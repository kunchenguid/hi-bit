---
name: hi-bit-design
description: Use this skill to generate well-branded interfaces and assets for Hi-Bit, an AI tutor desktop app that teaches kids 7-12 how to code. Contains design guidelines, colors, type, fonts, pixel-art assets, and UI kit components for prototyping or production work.
user-invocable: true
---

# Hi-Bit Design Skill

Hi-Bit is a cozy arcade for learning to code - pixel-art spirit, rounded-sans warmth, mentor-tone copy. Designed for kids 7-12 and the parents who trust the app.

The mascot is **Bit** - a curious little desktop-computer robot who leans in and figures things out with you.

## Where everything lives

All design sources are under `/design/` (relative to the repo root). From this skill's location at `.agents/skills/hi-bit-design/`, that's `../../../design/`.

| Path (from repo root) | What |
|---|---|
| `design/README.md` | Full design-system spec - brand, content, visual foundations, iconography |
| `design/tokens/colors_and_type.css` | Canonical CSS variables - colors, type, spacing, radii, shadows, motion |
| `design/assets/` | SVG logos, mascot, subject stickers, icon sprite, textures |
| `design/preview/` | 19 spec cards - one HTML file per token or component |
| `design/ui-kits/desktop/` | Clickable desktop UI kit - JSX components + `index.html` demo |

## How to use this skill

1. **Read `design/README.md` first.** It's the source of truth for brand voice, casing rules, color usage, type ramp, motion, and iconography.
2. **Import tokens** from `design/tokens/colors_and_type.css` - subject rainbow (HTML coral, CSS cyan, JS amber, art magenta, math lime), paper/night neutrals, Fredoka + Fira Code + Press Start 2P type ramp.
3. **Browse the preview cards** in `design/preview/` to see each token rendered in context.
4. **Reference current product surfaces** in `src/renderer/src/screens/` and `src/renderer/src/components/` for Codex connection, profile gate, chat workspace, grown-up settings, voice-enabled composer, and live preview flows.
5. **Use the UI kit** at `design/ui-kits/desktop/index.html` as a legacy brand prototype for visual patterns, not as the current product shell.
6. **Use assets** from `design/assets/`:
   - `mascot-boo.svg` - full-body Bit (filename kept for path stability; the character inside is Bit the robot)
   - `logo-mark.svg` - Bit's monitor head, used for tutor avatar + favicon
   - `logo-wordmark.svg` - "HI BIT" pixel wordmark
   - `sticker-{html,css,js,art,math}.svg` - subject stickers
   - `icons.svg` - 14-icon pixel sprite sheet (use via `<use href="icons.svg#i-home" />`)
   - `crt-overlay.svg`, `paper-texture.svg` - background textures

## What to output

- **Visual artifacts (slides, mocks, throwaway prototypes):** copy assets out and write static HTML files. Link to `design/tokens/colors_and_type.css`.
- **Production code (React/Electron):** port the tokens into your framework's source; copy `design/assets/` into `public/` or equivalent. Lift component patterns from the UI kit but simplify for your stack.

## If invoked without guidance

Ask what the user wants to build. Offer a few directions:

- A new screen, grown-up setting, or composer surface for the Hi-Bit app (Codex connection, profile gate, chat workspace, thinking speed, local voice input, live preview, onboarding)
- Marketing asset (app icon variations, a landing page)
- A slide for a parent-facing pitch deck
- A new subject added to the rainbow (e.g. Python - what color? what sticker?)

Then act as an expert designer in the Hi-Bit vocabulary and output HTML artifacts or production code depending on the need.

## Hard rules when designing for this brand

- **One subject hue per screen.** The rainbow is the system; a single project or workspace moment picks one color. Don't use all five at once.
- **Pixel is a spice, not the stew.** ~5% pixel type max. Body is rounded sans (Fredoka).
- **No emoji in UI chrome.** Bit chat is emoji-free by default unless that builder's parent notes opt back in; the first empty-chat idea sparks may use one emoji cue per temporary starter button.
- **Never pure white on pure black.** Always paper-cream on ink, or night-indigo on phosphor.
- **Hand-rolled SVG is the last resort for icons.** Use the pixel sprite sheet first; fall back to Lucide CDN for dense info surfaces.
- **Buttons get a 2px pixel drop-shadow, not a blur.**
- **Single-color borders/rings only.** Don't stack an ink shadow and a subject ring on the same edge - pick one.
