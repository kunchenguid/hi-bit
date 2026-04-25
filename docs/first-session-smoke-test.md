# First-session smoke test

A scripted walkthrough for validating the PRD §"The first session" 5-minute arc on a fresh install before shipping a release build. This is deliberately a manual checklist rather than an automated E2E harness: the arc crosses renderer UI, typed IPC, the installed external harness (Claude Code / Codex / OpenCode), the filesystem, and Bit's LLM - none of which a unit-test mock can faithfully cover end to end.

Unit tests under `src/**/*.test.ts` already regression-pin the individual pieces (chat hydrate, profile create, preview build, workspace reducer, etc.). This doc is the composite pass that proves the pieces hold together as a real first session.

Run this before every alpha release build and after any change that touches onboarding, Bit's system prompt, the chat store, or the dream picker.

## Setup

1. Delete any existing install data: `rm -rf ~/.hi-bit`
2. Install at least one supported harness (Claude Code recommended per `REFERENCE_HARNESS`). Verify it runs non-interactively: `claude -p "say hi" --session-id smoke-test`.
3. From the repo root, run `npm install && npm run dev`.

## The 5-minute arc

Timings are ideal-case; the arc should close inside 5 minutes on a reasonably fast machine with a warm harness cache.

### Step 1 - Parent installs, configures harness, creates kid profile

PRD: "Parent installs Hi-Bit, configures their chosen harness, creates a kid profile: name, age, interests, optional notes for Bit."

- [ ] App launches to `ProfileGate` (no profiles yet, so the create form auto-opens per `ProfileGate.tsx`).
- [ ] `CreateProfileForm.tsx` accepts a name, age (3-18), comma-separated interests, optional notes for Bit. Fill in a real kid-shaped profile - e.g. Name "Ada", age 9, interests "cats, drawing, games", notes "already knows some HTML from school".
- [ ] After submit, `HarnessSetup.tsx` shows Claude Code first with a "Recommended" badge (see `REFERENCE_HARNESS` in `src/shared/config.ts`). Select the harness you installed above.
- [ ] `DreamPicker.tsx` opens next, sorted with the kid's interest-tag matches floated to the top.

### Step 2 - Kid opens app, Bit greets by name

PRD: "Kid opens the app. Bit greets them by name, in voice."

- [ ] On the first open of `KidChat.tsx`, Bit's greeting bubble arrives within a few seconds. The greeting uses the kid's name from the profile (e.g. "Hi Ada!").
- [ ] The voice matches the design README rules (warm, lowercase-friendly, no em-dashes, no "great question!" openers).
- [ ] The greeting references the kid's known interests from `state.md` or asks about them - not a generic "what do you want to build today?" prompt.

### Step 3 - Bit asks about interests

PRD: "Bit asks about what they like (games, drawing, stories, animals). For younger kids this can be multi-choice."

- [ ] Bit's first or second turn surfaces an interest question. For a 9-year-old the question is open-ended; for a 7-year-old check that the phrasing leans multi-choice or binary.
- [ ] Typing a reply ("I like cat games") posts the turn via `window.hibit.sendKidMessage` and returns Bit's next message without error.

### Step 4 - Bit shows a filtered dream menu

PRD: "Bit shows a dream menu filtered by the kid's interests. Each dream is a real, achievable web project."

- [ ] Bit proactively offers the dream menu, or the kid can click through to `DreamPicker.tsx` from the workspace nav.
- [ ] The top of the dream list contains interest-matched dreams (e.g. cats + drawing surfaces `doodle-pad`, `pixel-painter`, `photo-scrapbook`, `sticker-gallery`). See `dreamInterestMatch.ts` for the ranking function.
- [ ] Every rendered dream card has a kid-facing title, category chip(s), and an interest-tag preview. No empty, broken, or duplicate cards.

### Step 5 - Kid picks a dream, Bit commits

PRD: "Kid picks a dream. Bit commits to the journey: 'We're going to build this together. Here's where we start.'"

- [ ] Clicking a dream card calls `setCurrentDream(profileId, dreamId)` in `profileStore.ts` and returns to the chat view.
- [ ] Bit's next turn acknowledges the chosen dream by name and commits to it ("We're going to build a sticker gallery together. Here's where we start."). No hedging, no offer to switch immediately.
- [ ] Bit names the first concrete knowledge-point step ("Let's get a page on the screen first") rather than dumping the whole roadmap.

### Step 6 - Typed something real, saw it run, saved a file

PRD: "Within five minutes of opening the app, the kid has typed something real, seen it run in the live preview, and saved a file they can open outside Hi-Bit."

- [ ] Bit leads the kid to the editor with a fill-in-the-blank or change-a-line task via `CodeEditor.tsx`.
- [ ] Typing in the editor updates the buffer; clicking Run renders via `buildPreviewSrcdoc` from `src/renderer/src/preview/buildPreview.ts` inside the iframe. The preview shows the kid's actual change.
- [ ] Clicking Save writes to `~/.hi-bit/profiles/<kid_id>/projects/<dream_slug>/` on disk. Confirm the file exists: `ls ~/.hi-bit/profiles/*/projects/`.
- [ ] Open the saved file in an external editor or browser and verify it renders the same thing the in-app preview showed. This proves the artifact survives outside Hi-Bit, which is the PRD's shareability contract.

## Wrap-up

- [ ] Total elapsed time from "app launches" to "saved file opens outside the app" is under 5 minutes.
- [ ] Total cost (LLM tokens for the arc) is reasonable - check `progress.json` `sessions[]` for the session summary if the harness reports it.
- [ ] No console errors in the Electron DevTools during the arc. Warnings are acceptable; red errors are not.
- [ ] The session log in `~/.hi-bit/profiles/<kid_id>/progress.json` records a `sessions[]` entry and at least one `knowledgePoints[]` status update reflecting what Bit covered.

## Failure modes to watch for

- **Bit greets as "kiddo" or a placeholder name** - indicates `state.md` is not being read or the profile name is not being injected. Check `state.md` under the profile dir and `prompts/bit.md` "Memory file paths and re-read instructions" section.
- **Dream picker shows every dream equally** - interest-tag ranking is broken. See `dreamInterestMatch.test.ts`.
- **Live preview shows a blank iframe** - `buildPreview.ts` srcdoc inlining failed. Check DevTools for CSP errors and `buildPreview.test.ts`.
- **Save silently fails** - the typed-IPC `saveProjectFile` in `src/main/index.ts` or `src/preload/index.ts` is mis-wired, or the profile dir was not created. Check `~/.hi-bit/profiles/` for permissions.
- **Harness spawn errors surface to the kid** - the error bubble should read "Bit went to grab a snack. Try again in a minute." with a Try-again button, per the resolved "Kid-facing outage UX" decision in `TECHNICAL_DESIGN.md` §Resolved.

If any of the checks above fail, do not ship the build. File an issue referencing this smoke test's step number so the regression is easy to reproduce.
