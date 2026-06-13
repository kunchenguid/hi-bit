# agent instructions

## What this project is

Hi-Bit is a local-first Electron app that teaches kids (7-12) to build real web apps with an AI tutor called Bit.
Parents connect Codex as the local LLM provider, and Hi-Bit runs Bit through embedded Pi coding runtimes using OpenAI Codex services.
Codex is not Hi-Bit's app account system.
Everything - auth state, factory metadata, kid profiles, learning progress, parked ideas, chat attachment files, project files, session files, and logbooks - lives on disk under Electron's `userData` dir.
Hi-Bit has no app cloud backend.
Production macOS builds display as `Hi Bit` in Finder, the Dock, and the menu bar, but keep the hyphenated `Hi-Bit` bundle name, app bundle path, artifacts, and Homebrew cask paths so existing user data and downloads keep working.
Packaged release builds may send anonymous, best-effort release telemetry to Kun's self-hosted Umami instance: app-level events only, no kid names, prompts, profile ids, creation ids, file contents, attachment ids, URLs, or paths.
Hi-Bit also performs a best-effort GitHub Releases check for newer app versions; it sends only the app's public `User-Agent` to GitHub, does not auto-install anything, and surfaces the Homebrew upgrade command plus release notes inside Settings.
Telemetry in source/dev/test builds is no-op unless a website id is explicitly supplied.
Set `HIBIT_TELEMETRY=0` (or `false` / `off`) to disable telemetry, or override the target with `HIBIT_UMAMI_HOST` / `HIBIT_UMAMI_WEBSITE_ID` for testing.
MIT.

This file is the canonical architecture and workflow guide for the current app. `CONTRIBUTING.md` governs changes to the retained knowledge graph and dream library.

## Stack and layout

- Electron 41, electron-vite, React 19, Vitest, Biome. TypeScript throughout.
- `src/main/` - Electron main process. `index.ts` wires IPC, initializes anonymous release-only Umami telemetry, starts the best-effort GitHub Releases update checker, broadcasts the Codex reconnect-required event, captures the live app renderer for Bit's `app_screenshot` tool, and grants camera / clipboard-read permissions only to the app renderer; `updateChecker.ts` owns cached newer-version detection against public GitHub Releases and opening release notes (no auto-update); `telemetry.ts` owns anonymous, best-effort release telemetry to self-hosted Umami (no-op without `HIBIT_UMAMI_WEBSITE_ID`, app-level events only, no kid data); `storage/` owns the on-disk home/config/auth/factory/profile layout and migrates legacy shared-factory data to layout version 2; `auth/` owns Codex OAuth, token refresh, and stale-refresh-token detection; `profiles/` owns kid profile records and the active profile id; `conversation/` owns the profile-level transcript, the durable chat attachment picture library, and active Bit session state, including the parent-triggered reset that clears only transcript/session state while preserving pictures; `projects/` owns profile-scoped creation records, starter files, workbench paths, project logbooks, each creation's remembered preview port, and (`subjectFiles.ts`) the defensive reader, lesson-page state detector, plus the one sanctioned mastery writer for a learning creation's `main-workbench/learning/` files; `preview/` owns per-creation local preview processes and reuses a stable loopback origin so browser `localStorage` game saves survive across plays and app restarts; `control/` is the in-app browser/automation engine - a `CdpController` drives a webContents over CDP (merged cross-frame accessibility snapshot with refs, ref-based click/type, screenshot), and `AppControlService` owns the loopback-only navigation gate (a creation's own preview only - external websites are refused; see `navigation.ts`), the lazily-attached app controller backing Bit's `app_*` tools (screenshot/snapshot/spotlight - observe only, never click the app chrome) and Bit's visible browser tabs, plus a `HeadlessBrowserHost` factory giving each bot its own offscreen, kid-invisible browser; `voice/` owns the on-disk Whisper voice model (downloaded once to `models/`) and the CORS-enabled `hibit-model://` protocol that serves it to the renderer's transcription worker; `pi/` adapts the Pi coding runtime, Bit's jailed `read`/`ls`/`grep`/`find` explorer tools and `write`/`edit` tools for tiny main-workbench fixes with built-in filesystem tools disabled, Bit image prompts, Bit's `app_screenshot`/`app_snapshot`/`app_highlight` tools for seeing the full app screen and spotlighting controls for the kid, the `browser_*` tools (open/navigate/snapshot/click/fill/read/screenshot) Bit drives over visible tabs and bots drive over headless ones, Bit and bot web tools (`web_search` via the Codex Responses backend's native hosted `web_search` tool on the same token as image generation - cached by default, `live: true` for fresh pages; `search_image` to find web pictures and download the actual pixels - on the same Codex token - so the model can see what an unfamiliar look is before scoping or drawing it, persisting each found picture to the profile image store with a reusable reference id while its base64 stays stripped from logbooks and renderer-bound events; `fetch_content` for local page-to-markdown extraction; and `get_search_content` for parked large payloads), the `view_bit` brand tool that lazily rasterises the bundled Bit mascot SVG once and returns a scrubbed model-visible image so Bit and bots can draw Bit on-model, bundled bot skills loaded from `skills/` (including `create-2d-game`, `create-3d-game`, `game-assets`, and `create-lesson`), Bit's own curated skills loaded from `skills-bit/` (currently just `teach-subject`, readable through a read-only extension of Bit's profile jail), and bot asset tools for Codex-backed image generation plus local sprite-sheet processing; `bots/` owns blueprints, bot jobs, isolated git worktree workbenches, machine inspections, and assembly-line installs; `bit/` coordinates the profile-level Bit chat, gates reset while Bit or a bot build is active, delegates substantive work to background bots, records direct Bit edits in creation logbooks, and appends the per-turn subjects note (goal, skill map, lesson build state, recent learning records per learning creation) after the vocabulary and coaching notes.
  Headless bot browser tabs load the preview before attaching CDP so `Page.enable` cannot hang on a never-navigated webContents; blank tabs remain unattached until `browser_navigate`, and both load and attach are deadline-guarded so stalled previews do not trap bot tool calls.
  Codex credentials live in a plaintext `0o600` local file under `auth/codex.json`; legacy keychain-encrypted files from older builds are treated as signed out so the builder reconnects once and future launches avoid keychain prompts.
  `<userData>/.hi-bit/home.json` stores `layoutVersion: 2` plus the active profile id.
  Each kid profile owns its own factory at `<userData>/.hi-bit/factories/<profileId>/` (factory and profile are 1:1), with `factory.json`, `lead.json`, `profile.json`, and Bit conversation state under `conversation/`, including the resettable transcript, Bit sessions under `conversation/sessions/bit`, and the durable picture library under `conversation/attachments`.
  The profile record also stores the learning state: `skillMastery` for the 13-skill agentic-engineering curriculum and `roadmap` for oversized or parallel asks Bit parked for later.
  Each stored attachment gets a stable id that Bit can pass as `referencePictureIds`; blueprints persist those ids plus conversation-relative paths, while bot runtime resolves them to the factory-level files so `generate_image.reference_paths` can condition generated art without copying builder pictures into creation workbenches.
  Pictures a bot or Bit finds with `search_image` or draws with `generate_image` land in the same `conversation/attachments` store, tagged by `source` (builder/searched/generated) in a sidecar `attachments/index.jsonl`, and get the same stable ids - so any of them resolves as a reference from any creation; builder pictures are also indexed so a chat reset does not strand their ids, while `list_builder_pictures` still filters to `source: "builder"` so the kid never sees machine pictures as ones they shared.
  Project folders live under `<userData>/.hi-bit/factories/<profileId>/projects/<projectId>/` and include `main-workbench`, `logbook`, `blueprints`, `jobs`, `workbenches`, `machines`, `assembly-line`, and `save-points` for the local bot pipeline.
  A creation whose `main-workbench/learning/` folder holds a valid `curriculum.json` is a **learning creation** (a subject the kid asked Bit to teach); that folder also carries `goal.md`, `learning-records/`, `resources.md`, and `notes.md`, all written by Bit and the bots with their ordinary file tools, while the `mastery` values inside `curriculum.json` move only through `record_progress` with `subject`.
  Project, blueprint, and bot job records are profile-scoped and no longer carry `factoryId`.
  `<userData>/.hi-bit/config.json` stores app config, including `defaultModel`, which defaults to `openai-codex/gpt-5.5`; values may include the `openai-codex/` prefix, which is stripped before the Pi runtime lookup.
  Bit and bot Pi sessions also load Hi-Bit's inline Codex fast-mode extension, which adds `service_tier: "priority"` only for supported `openai-codex` models `gpt-5.4` and `gpt-5.5`; unsupported or custom models are left unchanged, and there is no UI, toggle, or config knob for this.
  It also stores `thinkingSpeed` (one of `minimal`/`low`/`medium`/`high`/`xhigh`, defaulting to `medium`), the app-wide reasoning effort passed straight through as the Pi runtime `thinkingLevel` for both Bit and the bots; Settings' speed slider writes it via `hibit:config:*`, and `PiRuntimeService`/`BitRuntimeService` apply a change live by rebuilding idle sessions.
  `<userData>/.hi-bit/models/` holds locally downloaded models, currently the `whisper-large-v3-turbo` voice model fetched once on first voice use.
- `src/preload/index.ts` - the `contextBridge` that exposes `window.hibit` to the renderer, including preview-safe IPC helpers, `app.getUpdateStatus()` / `app.openReleasePage()` for the Settings update notice, `config.get()` / `config.setThinkingSpeed(speed)`, `auth.onReconnectRequired()`, `chat.send(profileId, text, image?)`, `chat.resetConversation(profileId)`, `progress.get(profileId)` for the Factory Handbook and My progress overlays, and `voice.status()` / `voice.ensureModel()` / `voice.onDownloadProgress()` for the one-time voice-model download. Every renderer IPC call goes through here.
- `src/renderer/` - the React UI. `screens/` holds the Codex connection gate, blocking Codex reconnect overlay, kid profile gate, and profile-level chat workspace with its optional browser split pane; `components/` holds the chat composer with one-picture input (paste, files, camera) and optional voice input - the composer mic button (`VoiceControl`) is itself push-to-talk (press and hold it for at least 500ms to talk and release to send, or quick-click for a hands-free recording the kid ends by tapping the mic again, which turns into a stop control), shown only when the device supports it, with a small live-waveform callout anchored above the button while active (a `role="status"` readout, not a modal - no backdrop) - backed by a `MicRecorder` (continuous AudioWorklet capture with a pre-roll buffer and a runaway cap) and a local Whisper Web Worker; camera capture modal, message list with attached-picture thumbnails, the `BrowserPane` (a tab strip over one sandboxed iframe per tab - creations only, where Play opens a creation tab; mirrors the main-owned browser state and reports each tab's load back), the `SpotlightOverlay` (a pointer-through ring + label Bit points with via `app_highlight`), the full-screen `SettingsOverlay` with Profile, How Bit works, and About & updates tabs, activity chip with persistent Play and the Factory view that merges creation picking with bot Logbook steps, showing only active bots as avatars while finished bots collapse into a Logbook pill that opens a right-docked master/detail panel named by each bot's task summary.
  The chat workspace also exposes the kid-opened Factory Handbook (`What I can do`) and My progress overlay, both backed by the shared `progress.get` view.
- `src/shared/` - types and schema shared between main, preload, and renderer, including `curriculum.ts` (the 13-skill, 4-arc agentic-engineering spine), `subjects.ts` (the learning-creation subject schema, mastery advance, and per-turn subjects note), `learning.ts` (the read-only progress view), and `concepts.ts` (Bit's gated vocabulary ladder).
- `graph/nodes/` and `graph/dreams/` - hand-authored curriculum content retained in the repo; see `CONTRIBUTING.md` before editing.
- `prompts/bit.md` and `prompts/bot.md` - Bit and bot system prompts. Product content, not code; edit them like you'd edit docs.
- `skills/` (bot skills) and `skills-bit/` (Bit's curated skills) - bundled Pi skills, lazily read by the model. Product content like the prompts; packaged via `extraResources`.
- `design/` - design tokens and the shared stylesheet the renderer consumes.

Bit's chat style is intentionally emoji-free by default.
A grown-up can opt a specific builder back into emojis through that profile's parent notes; those notes, along with the builder's stable name, age, and interests, live in Bit's session-level system prompt and are refreshed in place after profile edits without discarding conversation history.
The per-turn Bit prompt carries only volatile context such as the portfolio, current builds, the "Words you may use" vocabulary note, and the full learning map from `src/shared/curriculum.ts`.

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
| **factory**       | unlocked word                | the place all the kid's creations live and get built              | the per-kid factory (`factories/<profileId>/`, `ProjectService.list`)                      |
| **Logbook**       | unlocked word                | every step taken on a creation                                    | per-creation logbook (`logbook/project.jsonl`)                                             |
| **blueprint**     | chrome/code, not Bit chat    | the plan a bot follows to build                                   | `BlueprintRecord`, `blueprints/`, `blueprint_*`                                            |
| **machines**      | chrome/code, not Bit chat    | checks that make sure a build works                               | machine inspections (`machines/`)                                                          |
| **assembly line** | chrome/code, not Bit chat    | how a build moves step to step until ready                        | the install pipeline (`assembly-line/`)                                                    |
| **save points**   | chrome/code, not Bit chat    | saved spots to go back to                                         | `save-points/`                                                                             |
| **workbench**     | chrome/code, not Bit chat    | the private bench where a bot builds                              | isolated git-worktree workbench (`workbenches/`)                                           |
| **subject**       | everyone (plain word)        | one thing the kid asked Bit to teach them (Math, reading, ...)    | a learning creation: a project whose `main-workbench/learning/` holds `curriculum.json`    |
| **lesson**        | everyone (plain word)        | one page of a learning creation that teaches one small skill      | a lesson page under `lessons/`, built by a bot via the `create-lesson` skill               |

"creation" vs "project" is an intentional split, not drift: treat `projectId` and "creation id" as the same key, and keep "creation" in everything kid-facing while the types/services stay "project".

"subject" and "lesson" are deliberately plain, everyday words on both layers - they are not factory-metaphor words, so they have no unlock-ladder entry and Bit may say them freely (the ladder only governs inside words).
A subject has no record type of its own: it IS a learning creation, detected by the presence of a valid `main-workbench/learning/curriculum.json`.

"factory" is now one word for one place: each kid owns their own factory at `factories/<profileId>/` where their creations both live and get built, and `ProjectService.list` returns the creations in that factory. The former "Workshop" term is retired - folded into factory - so do not reintroduce it.

### The vocabulary unlock ladder

The factory world is real in code, and the static chrome always names it with the real in-world word - "bot", "your factory", "The Factory" - from day one.
The ladder governs exactly one thing: Bit's own chat.
Bit never proactively brings up an inside word before the kid has done the thing it names; the word becomes sayable for Bit the moment it becomes real, and Bit says it once, warmly, in plain chat (no UI badge).
Defined in `src/shared/concepts.ts`.

| Tier | Becomes sayable for Bit               | Trigger (what the kid did)               |
| ---- | ------------------------------------- | ---------------------------------------- |
| 0    | Bit, build, creation, Play            | always sayable                           |
| 1    | bot                                   | first delegated build finishes           |
| 2    | factory                               | the kid has a 2nd creation               |
| 3    | Logbook                               | the kid opens the Logbook                |

Rules that must hold:

- Static chrome (UI copy, labels, button text, activity and error strings) always uses the in-world word - never a pre-unlock vs unlocked variant. The ladder does not touch chrome, only Bit's chat.
- At most one new word is revealed per Bit turn (the pacing guard).
- Bit may only use inside words the kid has unlocked. `BitCoordinatorService` appends a per-turn "Words you may use" note (gated by `prompts/bit.md`); Bit must describe anything locked in plain kid words instead of naming it. The deeper mechanism words `blueprint`, `machines`, `assembly line`, `save points`, and `workbench` stay out of Bit chat for now even though they remain the code and chrome canon.
- Per-profile state lives on the profile record: `unlockedConcepts` (each with `firstSeenAt`) plus an `unlockStats` counter (`buildsDelegated`, `openedActivities`).

## Teaching system

Hi-Bit teaches agentic engineering through the build itself, not through standalone lessons.
`src/shared/curriculum.ts` defines the 13-skill, 4-arc spine: direct one agent, give Bit context, orchestrate many, and oversee the operation.
The curriculum map is appended to every Bit turn, but code does not pick a next nudge; Bit sees the whole map and decides whether, which, and when to teach one idea in conversation.
The deterministic part is the mastery ledger: Bit calls `record_progress` only when the builder actually demonstrates a skill, and `ProfileService.applySkillSignals` advances `skillMastery` monotonically from `unseen` to `grasped` to `fluent`.
Only `fluent` skills advance the build-tier ramp, and parallel bot work is gated until the builder has grasped directing and iterating on a single build.
When a request is too large, Bit starts one finishable slice and calls `park_ambition`; parked ideas live in `profile.roadmap`, can be read with `list_roadmap`, and can move to `started` or `done` with `update_roadmap`.
`src/shared/learning.ts` builds one read-only progress view for both reflection surfaces: the kid's Factory Handbook (`What I can do`) and My progress.

The agentic-engineering spine is taught only by building - never with lessons or quizzes; the one sanctioned exception is a **subject** the builder explicitly asked Bit to teach ("can you teach me Math?").
A subject is a learning creation: Bit runs a short goal interview, confirms, creates the creation, writes `learning/goal.md`, and delegates a research-and-first-lesson build; the bot grounds a 5-8 skill `learning/curriculum.json` in real web sources (plus `learning/resources.md`), builds the hub and the FIRST lesson only (unbuilt skills appear on the hub as unclickable coming-soon cards, never dead links), and Bit reviews and trims the curriculum before inviting Play.
Lessons then stay one build ahead of the kid: a completed build on a learning creation gets a completion prompt that points Bit back at the `teach-subject` skill's "After a learning build finishes" steps, so Bit trims first, invites Play, and - after the first build only - delegates lesson two while the kid plays; later lesson builds start from chat turns when the kid advances to the newest lesson, never from a build completing (that would snowball into building the whole map), keeping exactly one unplayed lesson ahead so each lesson can still bend to the learning records, and lesson jobs never touch `learning/curriculum.json` (Bit may be recording mastery into it mid-build, and overlapping edits would jam the `--ff-only` install).
Lessons are interactive pages of that creation, built like any build (the `create-lesson` bot skill holds the lesson doctrine; the `teach-subject` Bit skill in `skills-bit/` holds the teaching doctrine and file schemas, read lazily when a teach ask arrives or a learning build's completion prompt points back at it).
Subject mastery reuses the same monotonic machine via `record_progress` with `subject: "<creation id>"` (resolved against `curriculum.json` by `subjectFiles.ts`); editing `mastery` by hand or by model is forbidden, and subject mastery never feeds the build-tier ramp or the parallel gate.
Bit also appends learning records (`learning/learning-records/`) on real evidence - demonstrated understanding, disclosed prior knowledge, corrected misconceptions, goal shifts - and the per-turn subjects note carries goal, skill map, detected lesson build state, and recent records so a fresh or stale session resumes in the zone of proximal development and can start exactly one next lesson build when the builder reaches the newest built lesson.
Parents get visibility, not an approval gate: subjects appear in My progress with goals and precise skill names, and the `learning/` files are plainly inspectable in the creations folder.

## E2E testing the Electron app via chrome-devtools-axi

Hi-Bit is a Chromium-based Electron app.
Agents drive the real running renderer from the terminal by attaching `chrome-devtools-axi` to Electron's remote debugging port.
Use this section as the procedural field guide for clicking around, inspecting the DOM, evaluating JS, and reading console logs.

Manual E2E is for proving the behavior relevant to the current change, investigating a user-visible bug, or checking an integration that cannot be observed in unit tests.
Before a manual E2E pass, write down the one user-visible behavior you need to prove for the current change and the nearest regression risk.
Keep the pass narrow unless the task explicitly asks for a broader product sweep.
Repeatable product verification belongs in automated tests instead of in this file.
Use colocated Vitest `*.test.ts(x)` files for pure logic, services, IPC adapters, renderer components, and prompt-adjacent deterministic helpers.
Use a focused Electron E2E spec only when the assertion needs the real main process, preload bridge, Chromium permissions, browser frames, native dialogs, or the on-disk `userData` layout.
Do not add or move feature-specific checklist items into another permanent manual checklist unless a human explicitly asks for a one-off release checklist.

Codex credentials are stored under `<userData>/.hi-bit/auth/codex.json`.
Use the app's Codex connection flow or an isolated `userData` state appropriate for the current test.
Avoid kid personal details in prompts, screenshots, logs, and scratch files.

### One-time understanding

- `pnpm dev` runs `electron-vite dev`, which builds main + preload into `out/`, starts a Vite dev server on `http://localhost:5173` for the renderer, and launches Electron pointing at it.
- `electron-vite dev` passes trailing args through to the Electron binary.
  Chromium honors `--remote-debugging-port=<N>`, so the Electron renderer exposes CDP on that port.
- `electron-vite dev` does NOT rebuild or restart the running Electron app when `src/main/` or prompt-adjacent main code changes.
  The app keeps running the code it started with.
  After editing main-process code mid-E2E, kill the dev server and start it again, or the test exercises the old build.
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

`http://127.0.0.1:9222/json` lists page targets.
The renderer you want is the one with `"url": "http://localhost:5173/"` and `"title": "Hi-Bit"`.

### Fresh state without losing Codex auth (`HIBIT_USER_DATA_DIR`)

`pnpm dev` runs against the real `userData` dir, so a plain run inherits your Codex auth but also mutates real profiles and projects.
Wiping `<userData>/.hi-bit/` for a clean slate also wipes `auth/codex.json`, which drops you on the Codex sign-in gate - and an agent can't complete that OAuth flow on its own.

To get a fresh profiles/projects state that still starts signed in, point the dev build at an isolated userData dir with `HIBIT_USER_DATA_DIR` (dev-only; ignored in packaged builds):

```
HIBIT_USER_DATA_DIR=/tmp/hibit-e2e pnpm dev -- --remote-debugging-port=9222
```

On first launch with an isolated dir that has no auth yet, the app copies `codex.json` from your real userData (`~/Library/Application Support/hi-bit/.hi-bit/auth/codex.json` on macOS) into the isolated dir, so you land straight in the profile gate instead of the sign-in gate.
The copy only fills a missing file: if you sign a different account into the isolated dir, that wins and is never overwritten.
Codex tokens are stored in a plain local file (`0o600`) rather than the macOS keychain, so launching the app never triggers a keychain password prompt; the file is not tied to the dir path, so the copied file stays valid.
The main process logs `[hi-bit] isolated userData at <dir> (codex auth: seeded|already-present|no-source)` so you can confirm what happened.

Use a fresh dir name (or `rm -rf` the old one) per run when you want a clean slate; reuse the same dir across runs when you want state to persist between them.
This never touches the real userData, so it is the safe default for destructive or first-run flows.

### Attach chrome-devtools-axi to Electron

The axi bridge caches its target.
If it was previously connected to a different Chrome, you MUST stop it first or it will keep reporting that other session's pages:

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

`snapshot` returns an accessibility tree with `uid` refs you pass to `click`, `fill`, `hover`, etc.
Prefer `snapshot` + refs over CSS selectors because it matches how the app is actually exposed to users.

### Sanity checks

- `eval "typeof window.hibit"` should return `"object"`.
  If it returns `"undefined"`, the preload bridge did not load.
  The renderer will show the error boundary ("Something went sideways.") and every IPC-driven feature will be broken.
  Fix the preload wiring before continuing, and do not try to work around it.
- `console --type error` surfaces renderer-side errors.
  Main-process errors only show up in the `pnpm dev` output, not in axi.

### Tearing down

When you finish E2E testing, whether it passed, failed, or you are abandoning it, you MUST clean up after yourself.
Leaving a dev server, CDP endpoint, AXI bridge, or scratch files behind is a defect, not a convenience for the next run.
Do every step below, even if the test failed partway through.

1. Stop the AXI bridge: `chrome-devtools-axi stop`.
2. Kill the dev server: stop the `pnpm dev` process you started, which is the one running `electron-vite dev`.
   Quitting the Electron window also ends it because the dev server is tied to Electron's lifecycle, but do not rely on a window quit alone.
   Confirm the process is gone.
   If you launched it in the background, kill that background task by id.
   Otherwise, kill the process holding this run's debugging port with `kill $(lsof -ti :9222)`.
   The old documented pattern `pkill -f "electron-vite dev"` never worked because the actual process is `node .../electron-vite.js dev`, so the quoted pattern matches nothing and silently leaves the app running.
   Then verify nothing still holds the debugging port with `lsof -i :9222`.
3. Remove the isolated userData dir if you made one: `rm -rf /tmp/hibit-e2e` or whatever `HIBIT_USER_DATA_DIR` path you used.
   Never delete the real userData dir.
4. Delete any other scratch artifacts you created for the test: dumped logs, temp HTML, sample files written into a project, etc.
   Do not commit them and do not leave them in the working tree or `/tmp`.

After teardown, run a quick check that the tree and processes are clean: `git status` should show only the changes you intend to keep, and no `electron-vite dev` / `chrome-devtools-axi` processes should remain.
Do not leave background dev apps, CDP endpoints, AXI bridge processes, isolated userData dirs, or scratch files behind after validation.

### What E2E can and can't cover

- Can: exercise the real renderer, Chromium behavior, focus, accessibility tree, permissions, and iframe rendering for the behavior under test.
- Can: observe IPC round-trips through the preload bridge, since those run in the real main process against the real Hi-Bit layout under Electron's `userData` dir.
- Can: inspect visible side effects in the renderer, main-process logs, and files under the active `<userData>/.hi-bit/` tree.
- Cannot directly: prove hidden main-process internals, token-refresh decisions, Pi runtime turns, or tool-call routing except through their observable side effects.
- Cannot safely automate Codex OAuth sign-in from a blank machine state.
- Note: `pnpm dev` uses the real userData dir, so E2E runs will create or modify auth and project data there.
  For a clean slate that still starts signed in, prefer an isolated dir via `HIBIT_USER_DATA_DIR` rather than deleting `<userData>/.hi-bit/`.
  Deleting `<userData>/.hi-bit/` also wipes `auth/codex.json` and strands you on the Codex sign-in gate.

## Project conventions

- Package manager: `pnpm` only (lockfile is `pnpm-lock.yaml`).
- Typecheck: `pnpm typecheck`. Tests: `pnpm test`. Lint/format: `pnpm check` / `pnpm format`.
- Tests are Vitest, colocated next to the file under test as `*.test.ts(x)`.
- TDD is expected for bug fixes and new features (see global instructions).
- Do not auto-add an AI co-author to commits.
- Knowledge graph (`graph/nodes/`) and dream library (`graph/dreams/`) are hand-curated - see `CONTRIBUTING.md` before editing.
