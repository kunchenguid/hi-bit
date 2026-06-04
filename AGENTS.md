# agent instructions

## What this project is

Hi-Bit is a local-first Electron app that teaches kids (7-12) to build real web apps with an AI tutor called Bit.
Parents connect Codex as the local LLM provider, and Hi-Bit runs Bit through embedded Pi coding runtimes using OpenAI Codex services.
Codex is not Hi-Bit's app account system.
Everything - auth state, factory metadata, kid profiles, chat attachment files, project files, session files, and logbooks - lives on disk under Electron's `userData` dir.
No telemetry and no Hi-Bit cloud backend.
MIT.

This file is the canonical architecture and workflow guide for the current app. `CONTRIBUTING.md` governs changes to the retained knowledge graph and dream library.

## Stack and layout

- Electron 41, electron-vite, React 19, Vitest, Biome. TypeScript throughout.
- `src/main/` - Electron main process. `index.ts` wires IPC, broadcasts the Codex reconnect-required event, and grants camera / clipboard-read permissions only to the app renderer; `storage/` owns the on-disk home/config/auth/factory/profile layout and migrates legacy shared-factory data to layout version 2; `auth/` owns Codex OAuth, token refresh, and stale-refresh-token detection; `profiles/` owns kid profile records and the active profile id; `conversation/` owns the profile-level transcript, chat attachment files, and active Bit session state; `projects/` owns profile-scoped creation records, starter files, workbench paths, and project logbooks; `preview/` owns per-creation local preview processes; `pi/` adapts the Pi coding runtime, Bit's jailed `read`/`ls`/`grep`/`find` explorer tools and `write`/`edit` tools for tiny main-workbench fixes with built-in filesystem tools disabled, Bit image prompts, Bit and bot web tools (`web_search` via the Codex Responses backend's native hosted `web_search` tool on the same token as image generation - cached by default, `live: true` for fresh pages; `search_image` to find web pictures and download the actual pixels - on the same Codex token - so the model can see what an unfamiliar look is before scoping or drawing it, with its base64 stripped from logbooks and renderer-bound events; `fetch_content` for local page-to-markdown extraction; and `get_search_content` for parked large payloads), bundled bot skills loaded from `skills/` (including `create-2d-game`, `create-3d-game`, and `game-assets`), and bot asset tools for Codex-backed image generation plus local sprite-sheet processing; `bots/` owns blueprints, bot jobs, isolated git worktree workbenches, machine inspections, and assembly-line installs; `bit/` coordinates the profile-level Bit chat, delegates substantive work to background bots, and records direct Bit edits in creation logbooks.
  `<userData>/.hi-bit/home.json` stores `layoutVersion: 2` plus the active profile id.
  Each kid profile owns its own factory at `<userData>/.hi-bit/factories/<profileId>/` (factory and profile are 1:1), with `factory.json`, `lead.json`, `profile.json`, and one continuous Bit conversation under `conversation/`, including Bit sessions under `conversation/sessions/bit` and builder-attached pictures under `conversation/attachments`.
  Project folders live under `<userData>/.hi-bit/factories/<profileId>/projects/<projectId>/` and include `main-workbench`, `logbook`, `blueprints`, `jobs`, `workbenches`, `machines`, `assembly-line`, and `save-points` for the local bot pipeline.
  Project, blueprint, and bot job records are profile-scoped and no longer carry `factoryId`.
  `<userData>/.hi-bit/config.json` stores app config, including `defaultModel`, which defaults to `openai-codex/gpt-5.5`; values may include the `openai-codex/` prefix, which is stripped before the Pi runtime lookup.
- `src/preload/index.ts` - the `contextBridge` that exposes `window.hibit` to the renderer, including preview-safe IPC helpers, `auth.onReconnectRequired()`, and `chat.send(profileId, text, image?)`. Every renderer IPC call goes through here.
- `src/renderer/` - the React UI. `screens/` holds the Codex connection gate, blocking Codex reconnect overlay, kid profile gate, and profile-level chat workspace with its optional live-preview split pane; `components/` holds the chat composer with one-picture input (paste, files, camera), camera capture modal, message list with attached-picture thumbnails, preview pane, profile settings menu, activity chip with persistent Play and the Factory view that merges creation picking with bot Logbook steps.
- `src/shared/` - types and schema shared between main, preload, and renderer.
- `graph/nodes/` and `graph/dreams/` - hand-authored curriculum content retained in the repo; see `CONTRIBUTING.md` before editing.
- `prompts/bit.md` and `prompts/bot.md` - Bit and bot system prompts. Product content, not code; edit them like you'd edit docs.
- `design/` - design tokens and the shared stylesheet the renderer consumes.

## Fantasy terminology canon (do not drift)

Hi-Bit leans into a "futuristic factory" fantasy, but every word is deliberate.
This section is the canonical vocabulary; do not rename, swap synonyms, or introduce new metaphor words without updating it here first.
This canon binds **both layers**: kid-facing text (UI copy, Bit's and the bot's prompts, error and activity strings) must use the kid-facing word, and the **codebase** (types, services, variables, IPC channels, on-disk paths, comments) must use the code counterpart in the same row.
When you touch either layer, keep it consistent with the other and with this table - no off-canon synonyms in either one.
The one deliberate split is **creation** (everything kid-facing) vs **project** (the code counterpart for the same record); every other row uses one family of words across both layers.
The locking decisions (recorded in the terminology review): the background worker agent is a **bot** - never "builder", "worker" or "helper"; the kid is the **builder**.

| Term              | Who says it                  | What it means                                                     | Code counterpart                                                                           |
| ----------------- | ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Bit**           | everyone                     | the kid's AI building partner and the only thing the kid talks to | `BitCoordinatorService`, `prompts/bit.md`                                                  |
| **builder**       | Bit (for the kid)            | the kid using Hi-Bit                                              | the active profile                                                                         |
| **creation**      | kid-facing, Bit, bot prompts | one thing the kid is building                                     | `project` / `projectId`, `ProjectService`, `projects/<projectId>/`                         |
| **build**         | kid-facing                   | making or changing a creation                                     | a bot job run                                                                              |
| **Play**          | kid-facing                   | open and play a creation's live preview                           | `start_preview` / `list_previews` / `stop_preview` (the "Preview tools"), `PreviewService` |
| **bot**           | unlocked word                | a background worker that makes things for the kid                 | `BotRuntime`, `prompts/bot.md`, `bots/`, `bot_job_*`                                       |
| **factory**       | unlocked word                | the place all the kid's creations live and get built             | the per-kid factory (`factories/<profileId>/`, `ProjectService.list`)                       |
| **Logbook**       | unlocked word                | every step taken on a creation                                    | per-creation logbook (`logbook/project.jsonl`)                                             |
| **blueprint**     | unlocked word                | the plan a bot follows to build                                   | `BlueprintRecord`, `blueprints/`, `blueprint_*`                                            |
| **machines**      | unlocked word                | checks that make sure a build works                               | machine inspections (`machines/`)                                                          |
| **assembly line** | unlocked word                | how a build moves step to step until ready                        | the install pipeline (`assembly-line/`)                                                    |
| **save points**   | unlocked word                | saved spots to go back to                                         | `save-points/`                                                                             |
| **workbench**     | unlocked word                | the private bench where a bot builds                              | isolated git-worktree workbench (`workbenches/`)                                           |

"creation" vs "project" is an intentional split, not drift: treat `projectId` and "creation id" as the same key, and keep "creation" in everything kid-facing while the types/services stay "project".

"factory" is now one word for one place: each kid owns their own factory at `factories/<profileId>/` where their creations both live and get built, and `ProjectService.list` returns the creations in that factory. The former "Workshop" term is retired - folded into factory - so do not reintroduce it.

### The vocabulary unlock ladder

The factory world is real in code, and the static chrome always names it with the real in-world word - "bot", "your factory", "The Factory" - from day one.
The ladder governs exactly one thing: Bit's own chat.
Bit never proactively brings up an inside word before the kid has done the thing it names; the word becomes sayable for Bit the moment it becomes real, and Bit says it once, warmly, in plain chat (no UI badge).
Defined in `src/shared/concepts.ts`.

| Tier | Becomes sayable for Bit                        | Trigger (what the kid did)               |
| ---- | ---------------------------------------------- | ---------------------------------------- |
| 0    | Bit, build, creation, Play                     | always sayable                           |
| 1    | bot                                            | first delegated build finishes           |
| 2    | factory                                        | the kid has a 2nd creation               |
| 3    | Logbook                                        | the kid opens the Logbook                |
| 4    | blueprint, machines                            | a few builds in (`buildsDelegated >= 3`) |
| 5    | assembly line, save points, workbench          | many builds (`buildsDelegated >= 6`)     |

Rules that must hold:

- Static chrome (UI copy, labels, button text, activity and error strings) always uses the in-world word - never a pre-unlock vs unlocked variant. The ladder does not touch chrome, only Bit's chat.
- At most one new word is revealed per Bit turn (the pacing guard).
- Bit may only use inside words the kid has unlocked. `BitCoordinatorService` appends a per-turn "Words you may use" note (gated by `prompts/bit.md`); Bit must describe anything locked in plain kid words instead of naming it.
- Per-profile state lives on the profile record: `unlockedConcepts` (each with `firstSeenAt`) plus an `unlockStats` counter (`buildsDelegated`, `openedActivities`).

## E2E testing the Electron app via chrome-devtools-axi

Hi-Bit is a Chromium-based Electron app. You can drive the real running renderer from the terminal by attaching `chrome-devtools-axi` to Electron's remote debugging port. This is the supported way for an agent to click around, inspect the DOM, eval JS, read console logs, etc.

Manual E2E testing should exercise the Codex connection gate, stale-token reconnect overlay, kid profile gate, profile-level Pi-backed chat workspace, live creation preview flow, and creations-folder action unless the task explicitly narrows scope.
For Codex reconnect, verify that an expired or rejected refresh token clears the stored credential, shows a blocking reconnect overlay, keeps the current chat workspace mounted underneath, and removes the overlay after Codex is reconnected without clearing the draft, transcript, or open preview.
For the chat composer, verify that Enter sends the current message, Shift+Enter inserts a newline, Enter does not send while Bit is running, and IME composition is not interrupted.
For chat image input, verify the composer accepts exactly one picture from paste, file picking, and camera capture; downscales it before send; allows image-only messages; shows the thumbnail in the draft and transcript after reload; stores bytes under `conversation/attachments` while transcript and Bit session persistence keep only paths or scrubbed placeholders; and passes the image to Bit when the runtime supports inline images.
For real-art requests, verify that a bot calls `generate_image`, saves the generated image under the creation, wires it into the app, and shows it in the preview; for moving or transparent game art, also verify that the bot reads the `game-assets` skill and runs `process_sprite_sheet`.
For web-lookup requests, verify that Bit or a bot uses `web_search` for search with cached access by default, `fetch_content` for a known public URL, and `get_search_content` when a long fetched page is parked; do not send kid personal details in the test prompt.
For unfamiliar-visual requests (the builder names a character, creature, object, or art style Bit does not already recognize, e.g. "pusheen cat"), verify that Bit or a bot uses `search_image` to pull a real picture it can see before scoping or drawing, and that the downloaded base64 never reaches the on-disk logbook or renderer-bound tool events; do not send kid personal details in the test prompt.
For flat 2D playable-game requests, verify that the bot reads the `create-2d-game` skill, uses its loop/input/collision boilerplate, and combines it with `game-assets` when the game needs generated sprites.
For 3D playable-game requests (first-person/third-person worlds, blocky build-and-explore, 3D platformers/collectors/blasters), verify that the bot reads the `create-3d-game` skill, copies its `three.min.js` and `engine3d.js` into the creation, builds the world from textured primitives (textures from `generate_image`, not sprite sheets), and the live preview renders it in WebGL.
For live previews, verify that Play is available from a ready message and from the activity bar when there is one creation; when there are multiple creations, verify the activity bar opens The Factory, playable creations can start from it, and creations without previews are listed without Play.
Also verify that preview Play opens a sandboxed split-pane iframe only after the kid presses it, focuses the preview page for keyboard controls when it loads and after Reload/rebuild remounts, refetches rebuilt files and subresources instead of replaying Chromium's cached bytes after Reload or rebuild, is idempotent and can restart a persisted preview after an app restart, opens only loopback URLs in the system browser, and cleans up preview processes when the app quits or Bit stops the preview.
Codex credentials are stored under `<userData>/.hi-bit/auth/codex.json`; use the app's Codex connection flow or a clean `userData` state appropriate for the test.

### One-time understanding

- `pnpm dev` runs `electron-vite dev`, which builds main + preload into `out/`, starts a Vite dev server on `http://localhost:5173` for the renderer, and launches Electron pointing at it.
- `electron-vite dev` passes trailing args through to the Electron binary. Chromium honors `--remote-debugging-port=<N>`, so the Electron renderer exposes CDP on that port.
- `chrome-devtools-axi` can attach to any CDP endpoint via the `CHROME_DEVTOOLS_AXI_BROWSER_URL` env var instead of launching its own Chrome.

### Start the app with CDP exposed

Run in background - the dev server stays up for the duration of the test session:

```
pnpm dev -- --remote-debugging-port=9222
```

Wait for the CDP endpoint to come up before driving anything:

```
until curl -s -o /dev/null http://127.0.0.1:9222/json/version; do sleep 2; done
curl -s http://127.0.0.1:9222/json/version   # sanity-check: should report Electron/<version>
```

`http://127.0.0.1:9222/json` lists page targets. The renderer you want is the one with `"url": "http://localhost:5173/"` and `"title": "Hi-Bit"`.

### Fresh state without losing Codex auth (`HIBIT_USER_DATA_DIR`)

`pnpm dev` runs against the real `userData` dir, so a plain run inherits your Codex auth but also mutates real profiles and projects.
Wiping `<userData>/.hi-bit/` for a clean slate also wipes `auth/codex.json`, which drops you on the Codex sign-in gate - and an agent can't complete that OAuth flow on its own.

To get a fresh profiles/projects state that still starts signed in, point the dev build at an isolated userData dir with `HIBIT_USER_DATA_DIR` (dev-only; ignored in packaged builds):

```
HIBIT_USER_DATA_DIR=/tmp/hibit-e2e pnpm dev -- --remote-debugging-port=9222
```

On first launch with an isolated dir that has no auth yet, the app copies `codex.json` from your real userData (`~/Library/Application Support/hi-bit/.hi-bit/auth/codex.json` on macOS) into the isolated dir, so you land straight in the profile gate instead of the sign-in gate.
The copy only fills a missing file: if you sign a different account into the isolated dir, that wins and is never overwritten.
Codex tokens are encrypted with Electron's keychain-bound `safeStorage`, not anything tied to the dir path, so the copied file stays valid on the same machine and OS user.
The main process logs `[hi-bit] isolated userData at <dir> (codex auth: seeded|already-present|no-source)` so you can confirm what happened.

Use a fresh dir name (or `rm -rf` the old one) per run when you want a clean slate; reuse the same dir across runs when you want state to persist between them.
This never touches the real userData, so it is the safe default for destructive or first-run flows.

### Attach chrome-devtools-axi to Electron

The axi bridge caches its target. If it was previously connected to a different Chrome, you MUST stop it first or it will keep reporting that other session's pages:

```
chrome-devtools-axi stop
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi start
```

From here on, every axi command needs the same env var (the bridge doesn't remember it across `start`):

```
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi pages
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi snapshot
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi click @<uid>
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi fill @<uid> "<text>"
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi eval "<js>"
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222 chrome-devtools-axi console
```

Tip: `export CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9222` for the session if you are running many commands.

`snapshot` returns an accessibility tree with `uid` refs you pass to `click`, `fill`, `hover`, etc. Prefer `snapshot` + refs over CSS selectors - it matches how the app is actually exposed to users.

### Sanity checks

- `eval "typeof window.hibit"` should return `"object"`. If it returns `"undefined"`, the preload bridge did not load - the renderer will show the error boundary ("Something went sideways.") and every IPC-driven feature will be broken. Fix the preload wiring before continuing, don't try to work around it.
- `console --type error` surfaces renderer-side errors. Main-process errors only show up in the `pnpm dev` output, not in axi.

### Tearing down

```
chrome-devtools-axi stop
```

Then kill the `pnpm dev` process. Quitting the Electron window also ends the dev server because `electron-vite dev` is tied to Electron's lifecycle.

Always tear down the Electron dev app and the `chrome-devtools-axi` bridge when you finish e2e testing.
Do not leave background dev apps, CDP endpoints, or AXI bridge processes running after validation.

### What E2E can and can't cover

- Can: full renderer flow for Codex connection state, profile creation/selection/editing/switching, profile-level chat, Bit-delegated creation work, live preview Play controls, The Factory surface, abort, and opening the creations folder.
- Can: IPC round-trips through the preload bridge, since those run in the real main process against the real Hi-Bit layout under Electron's `userData` dir.
- Cannot directly: main-process internals such as token refresh, project file writes, or Pi runtime turns except by observing their side effects in the renderer or on disk under `<userData>/.hi-bit/`.
- Note: `pnpm dev` uses the real userData dir, so E2E runs will create/modify auth and project data there. For a clean slate that still starts signed in, prefer an isolated dir via `HIBIT_USER_DATA_DIR` (see "Fresh state without losing Codex auth" above) rather than deleting `<userData>/.hi-bit/` - a delete also wipes `auth/codex.json` and strands you on the Codex sign-in gate.

## Project conventions

- Package manager: `pnpm` only (lockfile is `pnpm-lock.yaml`).
- Typecheck: `pnpm typecheck`. Tests: `pnpm test`. Lint/format: `pnpm check` / `pnpm format`.
- Tests are Vitest, colocated next to the file under test as `*.test.ts(x)`.
- TDD is expected for bug fixes and new features (see global instructions).
- Do not auto-add an AI co-author to commits.
- Knowledge graph (`graph/nodes/`) and dream library (`graph/dreams/`) are hand-curated - see `CONTRIBUTING.md` before editing.
