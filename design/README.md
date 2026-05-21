# Hi-Bit Design System

> A cozy arcade for learning to code. Pixel-art spirit, rounded-sans warmth, mentor-tone copy - built for kids ages 7-12 and the parents who trust the app on their behalf.

---

## What is Hi-Bit?

**Hi-Bit** is a desktop Electron app that acts as an AI tutor, teaching kids ages 7-12 how to code. Current curriculum focus is **JavaScript, HTML, and CSS** - the web stack, because it's the fastest path from "I typed some words" to "my computer drew a thing."

The product's emotional promise is a contradiction we lean into on purpose:

- **For parents:** legible, accountable, no dark patterns, no ad-driven engagement loops. A real teacher behind the screen.
- **For kids:** a warm arcade. Pixel stickers, XP chimes, a tutor pal named **Bit** — a curious little desktop-computer robot who leans in and figures things out with you.

The aesthetic is **retro arcade / 8-bit**, but never harsh. Think: a 90s home computer's boot screen if it had been designed by someone who also makes children's books. CRT scanlines are a garnish, not the meal.

### Sources used to build this system

- **Brand:** greenfield - no prior marks. This design system *is* the brand spec. Iterate it here, then implement.
- **Referenced repo:** `kunchenguid/hi-bit` Electron app with Codex sign-in, project picking, and a Pi-backed Bit chat workspace.
- **User brief:** desktop Electron AI tutor, kids 7-12, aesthetic that parents trust and kids find friendly.

---

## Index of this folder

| File / folder | What it holds |
|---|---|
| `README.md` | This file — brand story, content & visual foundations, iconography |
| `tokens/colors_and_type.css` | All design tokens: colors (light + dark), type ramp, spacing, radii, shadows, motion |
| `fonts/` | Webfonts (via Google Fonts CDN; see **Typography** below) |
| `assets/` | Logos, mascot sprites, pixel-art icons, background textures |
| `preview/` | Design-system spec cards (rendered in the Design System tab) |
| `ui-kits/desktop/` | The Hi-Bit desktop app — interactive UI kit with JSX components + a click-thru `index.html` |
| `.agents/skills/hi-bit-design/SKILL.md` | Agent Skill manifest - lets agents pick this up as a portable skill |

---

## Content Fundamentals

### Voice

**Wise & warm, like a favorite teacher** - specifically the one you still quote twenty years later. Never condescending, never saccharine. Bit carries the voice in tutor chat; the UI itself is quieter.

The rule of thumb: *would a calm, excellent 5th-grade teacher say this to a kid whose parent was standing right there?* If no, rewrite.

### Tone shifts by surface

| Surface | Tone |
|---|---|
| Tutor chat (Bit) | Warm, curious, celebratory on wins, gentle on stuck moments |
| Buttons & menus | Plain and direct. Verbs. No marketing copy. |
| Empty states | Inviting, tiny bit playful |
| Errors | Calm, specific, never "oops!" |
| Parent-facing views | Respectful, transparent, no kid-speak |

### Pronoun & address

- **"You"** — always address the learner directly. Second person.
- **"We"** — Bit + learner together, used sparingly for the collaborative moments. *"We'll start with a button."*
- **"I"** — reserved for Bit in chat. *"I saved that lesson to your bookshelf."*
- Never **"the user,"** **"your child,"** or **"kids."** Those words don't appear in UI copy.

### Casing

- **Sentence case** everywhere: buttons, nav, headings, titles. *"Start a lesson"* not *"Start A Lesson"*.
- Two exceptions:
  - The wordmark: **HI BIT** (all-caps in its pixel display face — it's a logo, not a word in running text).
  - Badge titles: **All caps**, pixel font, for arcade flavor. *"STREAK MASTER"*, *"BUG HUNTER"*.

### Emoji & punctuation

- **No emoji in UI chrome.** Nav, buttons, toasts — all emoji-free.
- **Emoji allowed in tutor chat**, sparingly — maximum one per message, always at the end, only on genuine wins. A 🎉 after the first passing test, not on every reply.
- **No exclamation mark stacking.** One `!` max, used deliberately. Most sentences end in `.`
- **Em dashes are fine** — they match the mentor cadence.
- **No ALL CAPS for emphasis** in body copy. (Badges and the logo are the exceptions.)

### Numbers & code

- Numerals from **0** up (not spelled out) — this is a product about counting things that happen on computers. *"You wrote 3 lines."* not *"three lines."*
- Code snippets use **Fira Code** and real, runnable examples. No `foo`/`bar` placeholder-speak in student-facing copy. Use `price`, `name`, `score` — things a kid recognizes.

### Example copy (lifted from the UI kit)

> **Bit:** Hey — ready to keep going? Yesterday you made a button say "hi." Today we'll teach it to count.
>
> **Empty dashboard:** No lessons yet. Pick a subject and let's begin.
>
> **Passing test toast:** Nice. +15 XP.
>
> **Failing test toast:** Not quite — line 4 is missing a `;`. Try again.
>
> **Parent view intro:** This week, Ada spent 42 minutes on Hi-Bit, completed 3 lessons, and finished her first working web page.

### What we avoid

- "Awesome!" "Amazing!" "You're a rockstar!" — empty praise
- "Oops!" "Uh oh!" — infantilizing
- "Let's learn about…" style textbook openings
- "Unlock" for anything that isn't literally gated
- Pseudo-gamer slang ("grind," "sweat," "GG"). The arcade feel is visual, not verbal.

---

## Visual Foundations

### The core motif

**A friendly CRT.** Rounded pixel-art stickers sit on a warm, paper-adjacent background. Type is mostly smooth and rounded; pixel/mono fonts enter only as display flourishes (numbers, badges, the wordmark). CRT scanlines appear as a *subtle* (~4% opacity) overlay on hero art, never on body copy.

This means:

- **Surfaces are calm.** Cream/paper in light mode, deep indigo-black (`#0E0D1C`) in dark mode. Never pure white, never pure black.
- **Accents are loud.** Subject colors are fully saturated 8-bit primaries (cyan, magenta, yellow-amber, lime) — used *per lesson*, not everywhere at once.
- **Details are chunky.** 8px pixel grid governs everything: icon sprites are 16×16 or 32×32, radii are 4/8/12/16px, never fractional.

### Color system — see `tokens/colors_and_type.css` for values

**Neutrals (light mode):** a warm cream `--paper` base (`#F7F1E5`), step-darker surface `--paper-2`, and a near-black ink `--ink` (`#1A1626`) that echoes the dark-mode base.

**Neutrals (dark mode):** `--night` (`#0E0D1C`) base with a soft purple undertone, phosphor-glow foreground (`#EDE6FF`). Never `#000` on `#FFF`.

**Subject rainbow** — the heart of the system. Each learning subject has a named hue:

| Subject | Token | Light hex | Use |
|---|---|---|---|
| HTML | `--subject-html` | `#F26A4B` (coral) | tags, document structure lessons |
| CSS | `--subject-css` | `#2EC4F1` (sky cyan) | styling, layout lessons |
| JavaScript | `--subject-js` | `#FFC244` (sunny amber) | logic, interactivity |
| Pixel / art | `--subject-art` | `#E84C88` (magenta) | canvas, drawing, animation |
| Math in code | `--subject-math` | `#7BD86E` (lime) | numbers, randomness, geometry |
| Bit / mentor | `--brand` | `#6C5CE7` (indigo) | Bit's speech, brand chrome |

Semantic colors (`--success`, `--danger`, `--warning`) derive from the subject rainbow — `--success` is lime, `--danger` is coral, `--warning` is amber — so celebrations feel continuous with lessons.

### Typography

Three faces, each with a job. All available free from Google Fonts.

| Face | Role | Example |
|---|---|---|
| **Fredoka** (700, 600, 500, 400) | Rounded sans — UI chrome, body, headings | "Start a lesson" |
| **Fira Code** (500, 400) | Code, numbers-in-UI | `const price = 42` |
| **Press Start 2P** (400) | Pixel display — wordmark, badges, hero stats | **HI BIT**, **+15 XP** |

Press Start 2P is used *sparingly* — roughly 5% of total type on any screen. It's seasoning. Body text is Fredoka.

Code and editor text use Fira Code with ligatures and contextual alternates disabled, so symbols stay literal for kids reading and typing code.

Type ramp is defined in `tokens/colors_and_type.css` as `--t-display`, `--t-h1` through `--t-h4`, `--t-body`, `--t-small`, `--t-mono`, `--t-pixel`.

### Spacing

8px base grid. All padding, margin, and gaps are multiples of 4px (half-steps) or 8px. Tokens: `--s-0.5` (4) through `--s-12` (96).

### Backgrounds

- **Default:** flat `--paper` or `--night`. Never gradient-washed full screens.
- **Hero/celebration moments:** a **subtle paper-grain texture** (`assets/paper-texture.png`, multiply-blended at 8% opacity) plus an **optional CRT scanline overlay** at 4%.
- **No full-bleed photography.** This app is illustrative, not photographic.
- **Subject wash:** each lesson's hero card uses a `color-mix(in oklch, var(--subject-x) 12%, var(--paper))` tint. Quiet, not neon.

### Corners & borders

- **Radius scale:** `--r-sm` 4px, `--r-md` 8px, `--r-lg` 12px, `--r-xl` 16px, `--r-pill` 999px.
- **Pixel-edge style:** large surfaces (cards, modals) use a **1px outline in `--ink-12`** (12% ink) plus the main shadow. No fuzzy soft shadows without the crisp line; the 1px edge is what makes it feel 8-bit.
- **Buttons:** `--r-lg` (12px), with a **2px "drop-shadow" offset** below (pure `--ink` at 100%, offset-y 2px, no blur). On press, the shadow collapses and the button shifts down 2px — a chunky arcade press. Never blur-shadows on buttons.

### Shadows

Three systems:

1. **Pixel drop** (buttons, pill chips): `0 2px 0 0 var(--ink)` — hard, no blur.
2. **Soft lift** (cards, panels): `0 4px 16px -4px rgba(26, 22, 38, 0.12)` — for floating surfaces.
3. **Glow** (active lesson, XP gain): `0 0 0 3px color-mix(in oklch, var(--subject-x) 40%, transparent)` — a ring of the active subject hue.

### Motion

- **Easing:** `--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)` for arrivals (toasts, XP pops). `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` for everything else.
- **Durations:** 120ms (hover), 180ms (state changes), 280ms (enter/exit), 600ms (celebration burst).
- **Pixel jitter** — badges and Bit idle-breathe with a 2px up-down loop at 2s, step easing (not smooth) to preserve pixel-art integrity.
- **No full-page transitions.** View swaps are instant, with the arriving content's first element doing a small bounce-in.

### Hover & press states

- **Hover:** `filter: brightness(1.06)` on primary surfaces. On secondary, `background: --ink-06` (6% ink). Cursor stays default for large cards, `pointer` for explicit buttons.
- **Press:** buttons drop 2px and lose their pixel-drop shadow — they look like they've been physically pushed. Secondary surfaces get `--ink-12`.
- **Focus:** 2px ring in the subject color currently active on that screen, offset 2px from the element. Never browser-default blue.

### Transparency & blur

- **Blur is rare.** Used only on the tutor chat's sticky composer bar (16px backdrop-blur on `--paper/80`). Never on kid-facing cards — pixel art + blur looks muddy.
- **Transparency is semantic:** `--ink-04` through `--ink-40` give consistent overlay levels. Same for `--paper-08` etc. in dark mode (inverse).

### Imagery vibe

- **Pixel sprites**, warm palette, **outlined in ink** (1px). No anti-aliasing on sprite edges.
- **No photography.** The one exception is generic code-preview screenshots in onboarding, rendered through a CRT-monitor frame sprite.
- **Illustrations feel hand-placed**, slightly off-grid (±1px) to avoid sterile perfection.

### Cards

The canonical Hi-Bit card:

```
┌─────────────────────────────┐  ← --r-lg (12px)
│                             │  ← 1px --ink-12 outline
│   [sprite 32×32]            │  ← background: --paper-2
│                             │     or subject-tinted wash
│   Lesson title              │
│   3 / 8 · 24 XP             │
│                             │
└─────────────────────────────┘
   ↑ soft-lift shadow
```

- Padding: `--s-4` (24px) internal
- Title: `--t-h4`, weight 600
- Meta: `--t-small`, `--ink-64` (64% ink)
- Active/in-progress cards get the **glow** shadow; completed cards get a small corner checkmark sprite, no shadow change.

---

## Iconography

**Approach:** custom **pixel-art sprite sheet** shipped in `assets/icons.svg` (sprite symbols, usable via `<use>`). 16×16 and 32×32 variants, rendered crisp via `image-rendering: pixelated`. Colors inherit via `currentColor` so they can be tinted per subject.

**Why pixel and not a standard icon lib?** The arcade identity requires it — Lucide/Heroicons would flatten the brand. However:

- **Where pixel-art doesn't fit** (dense info-density screens like project review tools, or system chrome like close/minimize), we fall back to **Lucide React** via CDN, rendered at 18px stroke-1.75. This compromise is documented per-screen in each UI kit's README.
- **Emoji:** never in chrome. Allowed as mascot reactions in tutor chat (one per message, end-of-message only).
- **Unicode-as-icon:** avoided. If it's not a real icon, we don't fake one with `✓` or `→`.

**Logos:**
- `assets/logo-wordmark.svg` — "HI BIT" in Press Start 2P, filled `--ink` (light) / `--phosphor` (dark).
- `assets/logo-mark.svg` — the Bit mascot head (monitor face), a 32×32 pixel sprite. Used as favicon, app-icon source, and tutor avatar.
- `assets/mascot-boo.svg` — full-body Bit (64×64). A friendly pixel desktop-computer robot who tutors. *(Filename preserved for path stability; the character is Bit.)*

**Asset copy list** (in `assets/`):
- `logo-wordmark.svg`, `logo-mark.svg`, `mascot-boo.svg`
- `icons.svg` (sprite sheet)
- `paper-texture.png` (subtle grain for hero backgrounds)
- `crt-overlay.svg` (scanline pattern, tileable)
- Per-subject sprite stickers: `sticker-html.svg`, `sticker-css.svg`, `sticker-js.svg`, etc.

---

## Getting started (for designers/agents)

1. Read this file top to bottom.
2. Import `tokens/colors_and_type.css` — everything uses these tokens.
3. Preview tokens in the **Design System** tab (cards in `preview/`).
4. For a working reference of the product, open `ui-kits/desktop/index.html`.
5. If you're building a new screen: start from a card in the UI kit, keep the subject-rainbow rule (one hue per lesson, not all of them at once), and remember — **pixel is a spice, not the stew.**
