# agent instructions

## What this project is

Hi-Bit is a local-first Electron app that teaches kids (7-12) to build real web apps with an AI tutor called Bit.
The parent picks a supported ACP agent (Claude Code, Codex, OpenCode), and Hi-Bit runs turns through ACPX per kid-session.
Everything - profiles, transcripts, progress, saved projects - lives on disk under Electron's `userData` dir.
No telemetry, no cloud.
MIT.

Read `PRD.md` for product intent, `TECHNICAL_DESIGN.md` for architecture decisions, `V1_GAPS.md` for what's tracked as still-open vs. resolved. `CONTRIBUTING.md` governs changes to the knowledge graph and dream library.

## Stack and layout

- Electron 41, electron-vite, React 19, Zustand, CodeMirror 6, Vitest, Biome. TypeScript throughout.
- `src/main/` - Electron main process. `index.ts` wires IPC; `storage/` owns the on-disk profile layout (`state.md`, `progress.json`, transcripts, flags, project files, session logs, per-profile agent permission config); `agent/` owns ACPX availability and turn execution; `harness/` builds Bit chat turns around that agent layer; `graph/` loads the knowledge graph + dream library from `graph/` at the repo root.
  Regular ACP turns reuse a warm runtime keyed by session; helper turns discard their runtime state.
  Warm runtimes are closed when a kid session ends, a profile is deleted, a dream change rotates the kid session, the default agent changes, or the app quits.
- `src/preload/index.ts` - the `contextBridge` that exposes `window.hibit` to the renderer. Every renderer IPC call goes through here.
- `src/renderer/` - the React UI. `screens/` holds top-level views (kid home, dream picker, tutor chat, editor + live preview, parent gate, parent home with audit/mastery/directives/settings). `state/` is Zustand stores; `editor/` and `preview/` are the CodeMirror + iframe pieces.
- `src/shared/` - types and schema shared between main, preload, and renderer.
- `graph/nodes/` - hand-authored knowledge points. `graph/dreams/` - hand-authored dream projects. `src/main/storage/graphSeed.ts` mirrors shipped YAML into the user's profile dir on startup, including overwriting changed bundled files and deleting stale bundled YAML.
- `prompts/bit.md` - Bit's system prompt. Product content, not code; edit it like you'd edit docs.
- `design/` - design tokens and the shared stylesheet the renderer consumes.

## E2E testing the Electron app via chrome-devtools-axi

Hi-Bit is a Chromium-based Electron app. You can drive the real running renderer from the terminal by attaching `chrome-devtools-axi` to Electron's remote debugging port. This is the supported way for an agent to click around, inspect the DOM, eval JS, read console logs, etc.

Manual E2E testing should use Claude Code as the configured Hi-Bit agent unless the task explicitly asks to validate another ACP provider.
Before testing Bit chat, confirm `config.json` under Electron `userData` has `defaultAgent: "claude"`, or switch the app's selected agent to Claude through the setup UI.

### One-time understanding

- `npm run dev` runs `electron-vite dev`, which builds main + preload into `out/`, starts a Vite dev server on `http://localhost:5173` for the renderer, and launches Electron pointing at it.
- `electron-vite dev` passes trailing args through to the Electron binary. Chromium honors `--remote-debugging-port=<N>`, so the Electron renderer exposes CDP on that port.
- `chrome-devtools-axi` can attach to any CDP endpoint via the `CHROME_DEVTOOLS_AXI_BROWSER_URL` env var instead of launching its own Chrome.

### Start the app with CDP exposed

Run in background - the dev server stays up for the duration of the test session:

```
npm run dev -- --remote-debugging-port=9222
```

Wait for the CDP endpoint to come up before driving anything:

```
until curl -s -o /dev/null http://127.0.0.1:9222/json/version; do sleep 2; done
curl -s http://127.0.0.1:9222/json/version   # sanity-check: should report Electron/<version>
```

`http://127.0.0.1:9222/json` lists page targets. The renderer you want is the one with `"url": "http://localhost:5173/"` and `"title": "Hi-Bit"`.

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
- `console --type error` surfaces renderer-side errors. Main-process errors only show up in the `npm run dev` output, not in axi.

### Tearing down

```
chrome-devtools-axi stop
```

Then kill the `npm run dev` process. Quitting the Electron window also ends the dev server because `electron-vite dev` is tied to Electron's lifecycle.

Always tear down the Electron dev app and the `chrome-devtools-axi` bridge when you finish e2e testing.
Do not leave background dev apps, CDP endpoints, or AXI bridge processes running after validation.

### What E2E can and can't cover

- Can: full renderer flow (navigation, forms, live preview, CodeMirror input, parent-mode PIN, mastery grid rendering).
- Can: IPC round-trips through the preload bridge, since those run in the real main process against the real profile layout under Electron's `userData` dir.
- Cannot directly: main-process internals (file writes, ACPX agent start/turn execution) except by observing their side effects in the renderer or on disk under `<userData>/.hi-bit/`.
- Note: `npm run dev` uses the real userData dir, so E2E runs will create/modify profiles there. If you want a clean slate, delete `<userData>/.hi-bit/` between runs (on macOS: `~/Library/Application Support/hi-bit/.hi-bit/`).

## Project conventions

- Package manager: `npm` (lockfile is `package-lock.json`).
- Typecheck: `npm run typecheck`. Tests: `npm test`. Lint/format: `npm run check` / `npm run format`.
- Tests are Vitest, colocated next to the file under test as `*.test.ts(x)`.
- TDD is expected for bug fixes and new features (see global instructions).
- Do not auto-add an AI co-author to commits.
- Knowledge graph (`graph/nodes/`) and dream library (`graph/dreams/`) are hand-curated - see `CONTRIBUTING.md` before editing.
