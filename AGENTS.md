# agent instructions

## What this project is

Hi-Bit is a local-first Electron app that teaches kids (7-12) to build real web apps with an AI tutor called Bit.
Parents sign in with Codex, and Hi-Bit runs Bit through an embedded Pi coding runtime per project using OpenAI Codex services.
Everything - auth state, factory metadata, project files, session files, and logbooks - lives on disk under Electron's `userData` dir.
No telemetry and no Hi-Bit cloud backend.
MIT.

This file is the canonical architecture and workflow guide for the current app. `CONTRIBUTING.md` governs changes to the retained knowledge graph and dream library.

## Stack and layout

- Electron 41, electron-vite, React 19, Vitest, Biome. TypeScript throughout.
- `src/main/` - Electron main process. `index.ts` wires IPC; `storage/` owns the on-disk home/config/auth/factory layout; `auth/` owns Codex OAuth and token refresh; `projects/` owns project records, starter files, workbench paths, and project logbooks; `pi/` adapts the Pi coding runtime; `bots/` owns build plans, bot jobs, isolated git worktree workbenches, machine inspections, and assembly-line installs; `bit/` coordinates chat turns around projects.
  Pi sessions are reused per project and closed when a project runtime is disposed or the app quits. Project folders include `build-plans`, `jobs`, `workbenches`, `machines`, `assembly-line`, and `save-points` for the local bot pipeline.
  `<userData>/.hi-bit/config.json` stores app config, including `defaultModel`, which defaults to `openai-codex/gpt-5.5`; values may include the `openai-codex/` prefix, which is stripped before the Pi runtime lookup.
- `src/preload/index.ts` - the `contextBridge` that exposes `window.hibit` to the renderer. Every renderer IPC call goes through here.
- `src/renderer/` - the React UI. `screens/` holds the Codex auth gate, project picker, and chat workspace; `components/` holds the chat composer, message list, and tool activity pieces.
- `src/shared/` - types and schema shared between main, preload, and renderer.
- `graph/nodes/` and `graph/dreams/` - hand-authored curriculum content retained in the repo; see `CONTRIBUTING.md` before editing.
- `prompts/bit.md` - Bit's system prompt. Product content, not code; edit it like you'd edit docs.
- `design/` - design tokens and the shared stylesheet the renderer consumes.

## E2E testing the Electron app via chrome-devtools-axi

Hi-Bit is a Chromium-based Electron app. You can drive the real running renderer from the terminal by attaching `chrome-devtools-axi` to Electron's remote debugging port. This is the supported way for an agent to click around, inspect the DOM, eval JS, read console logs, etc.

Manual E2E testing should exercise the Codex auth gate, project picker, and Pi-backed chat workspace unless the task explicitly narrows scope.
Codex credentials are stored under `<userData>/.hi-bit/auth/codex.json`; use the app's sign-in flow or a clean `userData` state appropriate for the test.

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

- Can: full renderer flow for Codex sign-in state, project creation/picking, chat, abort, and opening a project folder.
- Can: IPC round-trips through the preload bridge, since those run in the real main process against the real Hi-Bit layout under Electron's `userData` dir.
- Cannot directly: main-process internals such as token refresh, project file writes, or Pi runtime turns except by observing their side effects in the renderer or on disk under `<userData>/.hi-bit/`.
- Note: `pnpm dev` uses the real userData dir, so E2E runs will create/modify auth and project data there. If you want a clean slate, delete `<userData>/.hi-bit/` between runs (on macOS: `~/Library/Application Support/hi-bit/.hi-bit/`).

## Project conventions

- Package manager: `pnpm` only (lockfile is `pnpm-lock.yaml`).
- Typecheck: `pnpm typecheck`. Tests: `pnpm test`. Lint/format: `pnpm check` / `pnpm format`.
- Tests are Vitest, colocated next to the file under test as `*.test.ts(x)`.
- TDD is expected for bug fixes and new features (see global instructions).
- Do not auto-add an AI co-author to commits.
- Knowledge graph (`graph/nodes/`) and dream library (`graph/dreams/`) are hand-curated - see `CONTRIBUTING.md` before editing.
