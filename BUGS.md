# Known bugs

Issues found during the Bit-as-Mayor play test, kept here until fixed.

## 1. Build-activity rows accumulate and never clear

Status: documented; proper solution to be designed later.

The "What Bit is building" panel appends every worker tool row (`ls`, `read`, `write`, ...) and leaves them at "completed" for the whole session.
Each new build piles more rows on top of the finished ones, so the panel grows unbounded and keeps showing stale, already-done work.
Only a reload clears it, because `chat.load` returns `tools: []`.

- Where: `tool_*` handling in `src/renderer/src/App.tsx` (`applyChatEvent`) and `src/renderer/src/components/ToolActivity.tsx`.
- Impact: cluttered, confusing panel within a long session; no real per-creation lifecycle.
- Not fixing yet. A proper solution needs a lifecycle for the rows - e.g. clear a creation's rows shortly after its completion turn posts, group rows by creation, or age/cap them. Think this through before implementing.

## Design notes (not bugs)

### Concurrent work on a creation is Bit's judgment, by design

The Mayor model intentionally has no server-side job queue or concurrency code-guard.
Per request Bit decides: independent work starts a parallel worker; work that depends on something still building gets a "let's wait until that's ready" reply and no new worker.
Residual assumption: if Bit misjudges and starts a second worker on the *same* creation while one is mid-build, the two git-worktree installs could race on `main-workbench`.
This is acceptable under the design - Bit is instructed to serialize same-creation work - and only worth a defensive per-creation install lock if it actually shows up in practice.
