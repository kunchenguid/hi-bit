# Known bugs

Issues found during the Bit play test, kept here until fixed.

(No open bugs.)

## Design notes (not bugs)

### Concurrent work on a creation is Bit's judgment, by design

The Bit model intentionally has no server-side bot job queue or concurrency code-guard.
Per request Bit decides: independent work starts a parallel bot; work that depends on something still building gets a "let's wait until that's ready" reply and no new bot.
Residual assumption: if Bit misjudges and starts a second bot on the *same* creation while one is mid-build, the two git-worktree installs could race on `main-workbench`.
This is acceptable under the design - Bit is instructed to serialize same-creation work - and only worth a defensive per-creation install lock if it actually shows up in practice.
