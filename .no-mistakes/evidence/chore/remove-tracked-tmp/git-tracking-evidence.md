# `.tmp` Tracking Evidence

Intent: remove only `.tmp` content from current tracking, ignore `.tmp` going forward, and leave `.no-mistakes` evidence artifacts trackable.

## Target diff scope

Command: `git diff --name-status 3b39c64ac6d3ced336d5aa8ceb40621a96d2616c..e8fc2b2a920079ec9c39e32f4b5ccc9cdc0be27d`

```text
M	.gitignore
D	.tmp/hibit-image-input-dev.log
D	.tmp/hibit-image-input-dev.pid
D	.tmp/hibit-image-input-user-data/.hi-bit/auth/codex.json
D	.tmp/hibit-image-input-user-data/.hi-bit/config.json
D	.tmp/hibit-image-input-user-data/.hi-bit/factories/ada/factory.json
D	.tmp/hibit-image-input-user-data/.hi-bit/factories/ada/lead.json
D	.tmp/hibit-image-input-user-data/.hi-bit/factories/ada/profile.json
D	.tmp/hibit-image-input-user-data/.hi-bit/home.json
```

## Target tree has no tracked `.tmp`

Command: `git ls-tree -r --name-only e8fc2b2a920079ec9c39e32f4b5ccc9cdc0be27d -- .tmp`

```text

```

## `.tmp` is ignored going forward

Command: `git check-ignore -v .tmp/probe-file .tmp/nested/probe-file`

```text
.gitignore:31:.tmp/	.tmp/probe-file
.gitignore:31:.tmp/	.tmp/nested/probe-file
```

## `.no-mistakes` evidence remains trackable

Command: `git ls-tree -r --name-only e8fc2b2a920079ec9c39e32f4b5ccc9cdc0be27d -- .no-mistakes`

```text
.no-mistakes/evidence/feat/builder-picture-references/reference-image-pipeline-evidence.json
.no-mistakes/evidence/feat/factory-logbook-panel/factory-collapsed-logbook-pill.png
.no-mistakes/evidence/feat/factory-logbook-panel/factory-expanded-logbook-panel.png
.no-mistakes/evidence/feat/in-app-browser-tools/allowed-websites-example.png
.no-mistakes/evidence/feat/in-app-browser-tools/blocked-navigation.txt
.no-mistakes/evidence/feat/in-app-browser-tools/electron-dev.log
.no-mistakes/evidence/feat/in-app-browser-tools/example-web-tab.png
.no-mistakes/evidence/feat/in-app-browser-tools/grown-up-menu.png
.no-mistakes/evidence/feat/persist-image-refs/search_image-flow.html
.no-mistakes/evidence/feat/persist-image-refs/search_image-model-sees.png
.no-mistakes/evidence/feat/persist-image-refs/search_image-persisted-reference.json
.no-mistakes/evidence/fix/control-browser-hangs/electron-headless-browser-evidence.cjs
.no-mistakes/evidence/fix/creation-preview-browser-only/preview-browser-only-evidence.html
.no-mistakes/evidence/fix/creation-preview-browser-only/preview-browser-only-evidence.png
```

Command: `git check-ignore -v .no-mistakes/evidence/chore/remove-tracked-tmp/probe.txt`

```text

```

No output from `git check-ignore` for the `.no-mistakes` path means that path is not ignored.
