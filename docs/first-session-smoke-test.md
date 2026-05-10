# First-session smoke test

A scripted walkthrough for validating the PRD §"The first session" 5-minute arc on a fresh install before shipping a release build.
This is deliberately a manual checklist rather than an automated E2E harness: the arc crosses renderer UI, typed IPC, the selected ACP agent (Claude Code / Codex / OpenCode), the filesystem, and Bit's LLM - none of which a unit-test mock can faithfully cover end to end.

Unit tests under `src/**/*.test.ts` already regression-pin the individual pieces (chat hydrate, profile create, preview build, shell routing, etc.). This doc is the composite pass that proves the pieces hold together as a real first session.

Run this before every alpha release build and after any change that touches onboarding, Bit's system prompt, the chat store, or the dream picker.

## Setup

1. Delete any existing install data: `rm -rf ~/.hi-bit`
2. Install at least one supported ACP agent (Claude Code recommended per `REFERENCE_AGENT`) and make sure `npx` is available.
   Hi-Bit launches ACP providers through generated clean launch specs under `.acpx-sessions/clean-agent-launch`, so smoke testing should exercise the app path instead of only running the agent CLI directly.
3. From the repo root, run `npm install && npm run dev`.

## The 5-minute arc

Timings are ideal-case; the arc should close inside 5 minutes on a reasonably fast machine with a warm agent cache.

### Step 1 - Parent installs, configures agent, creates kid profile

PRD: "Parent installs Hi-Bit, configures their chosen agent, creates a kid profile: name, age, interests, optional notes for Bit."

- [ ] App launches to `ParentShell.tsx` (no profiles yet, so `ParentGate.tsx` opens before the create form).
- [ ] Set or enter the parent PIN in `ParentGate.tsx`; unlocking opens the parent learner picker with `Add your first learner.`.
- [ ] Click `+ Add a new learner`; `CreateProfileForm.tsx` opens for learner creation.
- [ ] `CreateProfileForm.tsx` accepts a name, age (3-18), comma-separated interests, optional notes for Bit. Fill in a real kid-shaped profile - e.g. Name "Ada", age 9, interests "cats, drawing, games", notes "already knows some HTML from school".
- [ ] The new profile contains seeded `.claude/settings.json` and `opencode.json` permission config files; parent-edited versions are preserved when reopening a legacy profile.
- [ ] After the first agent turn, `.acpx-sessions/clean-agent-launch` contains generated launch specs for the selected provider.
  Codex specs include `ignore_user_config=true`; OpenCode specs use `--pure` and an isolated `XDG_CONFIG_HOME` under `.acpx-sessions/clean-agent-config`.
- [ ] After submit, `HarnessSetup.tsx` shows Claude Code first with a "Recommended" badge (see `REFERENCE_AGENT` in `src/shared/config.ts`). Select the agent you installed above.
- [ ] Returning to `ProfileGate.tsx` with at least one profile shows a `For grown-ups` entry point after the learner list.
- [ ] Clicking `For grown-ups`, unlocking `ParentGate.tsx`, and choosing `Open parent mode` opens `ParentHome.tsx` for that learner inside `ParentShell.tsx`; `Switch profile` returns to the parent learner picker without dropping back to kid sign-in.
- [ ] From the unlocked parent learner picker, clicking `+ Add a new learner` opens `CreateProfileForm.tsx` without another PIN prompt; submit or cancel returns to the parent learner picker.
- [ ] After setup, `ParentHome.tsx` opens for the new learner; exit parent mode, choose the learner in `ProfileGate.tsx`, and confirm `DreamPicker.tsx` opens with `playground` pinned first and labeled `Not sure yet?`.
  The `Great first dream` starter projects follow before interest-tag matches for a brand-new profile.

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
- [ ] For a brand-new profile, the top dream is `playground` with the `Not sure yet?` cue and `talk with Bit before picking a project` text.
- [ ] The next fixed-project dreams are the zero-knowledge starter dreams from `pickGreatFirstDreamIds`, ordered by lower difficulty and then fewer required skills.
- [ ] After the first dream is no longer active, interest-matched dreams float up (e.g. cats + drawing surfaces `doodle-pad`, `pixel-painter`, `photo-scrapbook`, `sticker-gallery`). See `dreamInterestMatch.ts` for the ranking function.
- [ ] Every rendered dream card has a kid-facing title, category chip(s), a bit difficulty rating with mascot icons, and an interest-tag preview. No empty, broken, or duplicate cards.

### Step 5 - Kid picks a dream, Bit commits

PRD: "Kid picks a dream. Bit commits to the journey: 'We're going to build this together. Here's where we start.'"

- [ ] To validate the fixed-project path, choose a non-`playground` dream card.
- [ ] Clicking a dream card calls `setCurrentDream(profileId, dreamId)` in `profileStore.ts` and returns to the chat view.
- [ ] Bit's next turn acknowledges the chosen dream by name and commits to it ("We're going to build a sticker gallery together. Here's where we start."). No hedging, no offer to switch immediately.
- [ ] Bit treats the starter `projects/<dream_slug>/index.html` as already existing and tells the kid to open or change it, not create a new `index.html`.
- [ ] Bit names the first concrete knowledge-point step ("Let's get a page on the screen first") rather than dumping the whole roadmap.
- [ ] If choosing `playground` instead, Bit stays in free-build mode: no fixed dream path appears, but the learning strip may show `Up next` for a suggested ready skill and the greeting may mention practicing it.
- [ ] On the active `playground` chat page, `Start over` appears next to `I'm done for now`; cancel once to confirm no files change, then confirm once to verify `projects/playground/` resets and reloads while `progress.json` keeps prior learning progress.

### Step 6 - Typed something real, saw it run, saved a file

PRD: "Within five minutes of opening the app, the kid has typed something real, seen it run in the live preview, and saved a file they can open outside Hi-Bit."

- [ ] Bit leads the kid to the editor with a fill-in-the-blank or change-a-line task via `CodeEditor.tsx`.
- [ ] When the latest Bit message includes fenced code blocks, each block shows its own `Show me where` button. Clicking one opens or focuses the editor as needed and displays a marker at the intended location for that snippet. A unique exact snippet match in the open file should place the marker locally without calling `window.hibit.requestCursorMarker`; non-exact or ambiguous matches should fall back to `requestCursorMarker`. Plain text instructions should not show this button.
- [ ] Docked workspaces start in `Code` view. Typing in the editor updates the buffer; clicking `See my page` formats supported dirty HTML/CSS/JS buffers, saves them, renders via `buildPreviewSrcdoc` from `src/renderer/src/preview/buildPreview.ts`, switches to `Page` view, and shows the kid's actual change inside the iframe.
- [ ] In `Page` view, the preview shows `See my code`. Clicking it returns to `Code` view.
- [ ] When Bit asks the kid to open the editor or switch workspace views, the hidden `<hi-bit:expect-action>` block does not appear in chat. Completing the matching action, such as `Open the editor`, `See my page`, or `Split`, sends a short Bit follow-up; unrelated clicks do not.
- [ ] After clicking `See my page`, `progress.json` records `run-and-preview` as `saw_it` with the live-preview evidence, even if Bit did not emit a hidden progress block.
- [ ] The `Split` view shows the code editor and live preview together. If `Show me where` is used while in `Page` view, the workspace switches to `Split` and shows the cursor marker, using Bit's snippet-specific label when provided and `Type here` as the fallback.
- [ ] For the `show-me-around` starter tour, switching to `Split` after `See my page` promotes `run-and-preview` to `did_with_help`; Bit then treats the one-skill dream as complete and points the kid at `Switch dream`.
- [ ] After another edit, clicking `Refresh` in the live preview header updates the iframe from the latest buffer content. Clicking `Refresh` again without editing reloads the iframe.
- [ ] If another supported HTML/CSS/JS edit is still dirty, clicking Save formats it, writes it to `~/.hi-bit/profiles/<kid_id>/projects/<dream_slug>/` on disk, and shows `Code formatted and saved`. Confirm the file exists: `ls ~/.hi-bit/profiles/*/projects/`.
- [ ] If broken supported code cannot be formatted, clicking Save still writes the unformatted code instead of blocking the save.
- [ ] Open the saved file in an external editor or browser and verify it renders the same thing the in-app preview showed. This proves the artifact survives outside Hi-Bit, which is the PRD's shareability contract.
- [ ] From `KidChat.tsx`, click `Start over`, cancel once to confirm no files change, then confirm once to verify starter files replace the current `projects/<dream_slug>/` files, the project reloads, the kid chat starts a fresh session, and `progress.json` keeps prior learning progress.

## Wrap-up

- [ ] Total elapsed time from "app launches" to "saved file opens outside the app" is under 5 minutes.
- [ ] Total cost (LLM tokens for the arc) is reasonable - check `contextTokensUsed` / `contextTokensSize` in the session log if the agent reports them.
- [ ] No console errors in the Electron DevTools during the arc. Warnings are acceptable; red errors are not.
- [ ] `~/.hi-bit/profiles/<kid_id>/session-log.jsonl` records at least one agent turn, and `progress.json` records at least one `knowledgePoints[]` status update reflecting what Bit covered.
  If Bit emits a hidden `<hi-bit:progress>` block, it does not appear in the kid-visible chat or transcript, and the learning strip updates after the turn with `New skill learned` or `New skills learned`.
  For a one-skill dream, the learning strip keeps `Up next` visible when there is still a next step and does not show old aggregate skill counts like `0 of 1 done` or `1 learned`.

## Failure modes to watch for

- **Bit greets as "kiddo" or a placeholder name** - indicates the profile name or session memory is not being injected. Check `state.md` under the profile dir, `buildSessionContextPreamble`, and the `prompts/bit.md` "Memory protocol" section.
- **Dream picker shows every dream equally** - interest-tag ranking is broken. See `dreamInterestMatch.test.ts`.
- **Live preview shows a blank iframe** - `buildPreview.ts` srcdoc inlining failed. Check DevTools for CSP errors and `buildPreview.test.ts`.
- **Save silently fails** - the typed-IPC `saveProjectFile` in `src/main/index.ts` or `src/preload/index.ts` is mis-wired, or the profile dir was not created. Check `~/.hi-bit/profiles/` for permissions.
- **Agent errors surface to the kid** - the error bubble should read "Bit went to grab a snack. Try again in a minute." with a Try-again button, per the resolved "Kid-facing outage UX" decision in `TECHNICAL_DESIGN.md` §Resolved.
- **Hung agent turn never recovers** - a kid turn that runs too long should cancel the request and show "Bit is taking too long. Tap try again and we'll give it another shot." with a Try-again button.

If any of the checks above fail, do not ship the build. File an issue referencing this smoke test's step number so the regression is easy to reproduce.
