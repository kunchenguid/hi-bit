# Contributing to Hi-Bit

Hi-Bit is MIT-licensed and open to outside contributions.
One rule up front:

**Human-authored pull requests targeting `main` must be raised through [`no-mistakes`](https://github.com/kunchenguid/no-mistakes).**

`no-mistakes` puts a local git proxy in front of your real remote.
Pushing through it runs an AI-driven review, test, lint, and CI pipeline in an isolated worktree, forwards the push upstream only after every check passes, and opens a clean PR automatically.

A GitHub Actions check named `Require no-mistakes` runs on PRs targeting `main` and fails if the body is missing the deterministic signature that no-mistakes writes.
Known automation accounts are exempt so dependency and release automation can keep working.
Regular contributor PRs without the signature will not be reviewed or merged.

## Workflow

1. Fork the repo and clone your fork.
2. Create a branch and make your changes.
3. Initialize the gate in the repo once: `no-mistakes init`.
4. Commit your changes.
5. Push through the gate instead of pushing to `origin`: `git push no-mistakes`.
6. Run `no-mistakes` to attach to the pipeline, watch findings, and auto-fix or review as needed.
7. Once the pipeline passes, it forwards the push upstream and opens the PR for you.

See the [no-mistakes quick start](https://kunchenguid.github.io/no-mistakes/start-here/quick-start/) for the full first-run walkthrough.

## Repo Conventions

- Use `pnpm` with the pinned version from `packageManager`.
- Use TDD for bug fixes and new features.
- Tests are Vitest tests colocated next to the file under test as `*.test.ts` or `*.test.tsx`.
- Run `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before pushing.
- Run `pnpm package:mac` when changing packaging, runtime paths, native dependencies, release behavior, or anything that affects the packaged app layout.
- Local `pnpm package:mac` builds intentionally produce `Hi-Bit Dev.app` with bundle id `com.hibit.app.dev`.
- Release automation uses `electron-builder.yml` directly for the production `Hi-Bit.app` identity.
- Keep universal macOS packaging compatible with both Intel and Apple Silicon Macs.
- Native prebuilt packages must be installed for `x64` and `arm64` and preserved in `electron-builder.yml` `x64ArchFiles` when electron-builder merges the app.
- Keep `electron-builder` at `26.8.2` or newer so pnpm-deduped dependencies are included correctly in packaged builds.
- Keep `@huggingface/transformers` in `devDependencies` because it is browser-bundled into the renderer worker and must not make electron-builder package native optional inference dependencies into the app.
- Keep `pnpm-lock.yaml` changes with dependency changes.
- Do not commit generated build output, release artifacts, runtime caches, scratch files, or `src/renderer/src/generated`.
- Use the ignored `.tmp/` directory for short-lived in-repo scratch data, and remove anything that should not persist after the run.
- Do not hand-edit release-please metadata such as `CHANGELOG.md` or `.release-please-manifest.json`.
- See `AGENTS.md` for architecture notes, Electron E2E guidance, fantasy terminology, and agent-specific constraints.

## Release Notes

Hi-Bit releases are proposed by release-please after conventional commits land on `main`.
Use prefixes such as `feat:` and `fix:` so release-please can choose the version bump and release notes.
Mark breaking changes with `!` in the commit type or a `BREAKING CHANGE:` footer.
Merging the release-please PR creates the version tag and GitHub Release.
The release-please workflow then builds and uploads the macOS DMG, then updates `kunchenguid/homebrew-tap` with the release SHA.
The generated Homebrew Cask quits Hi-Bit during upgrade and relaunches it after installation only when the app was already running before uninstall started.
Packaged Hi-Bit checks the public `kunchenguid/hi-bit` GitHub Releases API at most every 4 hours to detect a newer version.
It does not auto-install updates; the Grown-up menu shows a quiet dot, the `brew update && brew upgrade --cask hi-bit` command, and a release-notes link when a newer release exists.
Maintainers must keep `HOMEBREW_TAP_TOKEN` configured with write access to `kunchenguid/homebrew-tap` for that update step.
Maintainers must keep `HIBIT_UMAMI_WEBSITE_ID` configured as a GitHub Actions repository variable for packaged-release telemetry.
It is intentionally a variable rather than a secret because the id is baked into the app and sent in Umami payloads.
The release workflow bakes `HIBIT_UMAMI_HOST` and `HIBIT_UMAMI_WEBSITE_ID` into the packaged main bundle; source, dev, and test builds stay no-op unless a website id is supplied.
Set `HIBIT_TELEMETRY=0` (or `false` / `off`) to disable telemetry at runtime.
Do not manually rewrite the tap from this repo outside that workflow unless you are repairing a failed release.

## Ownership

The canonical knowledge graph under `graph/nodes/` and the dream library under `graph/dreams/` are hand-curated.
Both are considered the core IP of the app and are maintained under a lightweight benevolent-dictator model.

- **Maintainer:** Kun Chen (@kunchenguid) has final say on what lands in `graph/`.
- **Everything else:** any maintainer with write access can merge non-graph PRs once no-mistakes, tests, and CI are green.

The graph is authored, not crowdsourced.
Outside PRs are welcome, but the bar is deliberately high because the retained curriculum and every shipped dream depend on the graph staying small and sharp.

## Before You Open A Graph PR

Run the relevant validators locally.
These match CI:

```sh
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

The current Pi-backed app does not ship a dedicated graph validator.
Keep graph and dream edits small enough for maintainer review, and do not rely on runtime validation to catch content mistakes.

## Adding A Knowledge Point

Summary of what reviewers look for:

1. **One sharp concept.** "CSS" is not a KP.
   "Changing the background color of a div" is a KP.
   A KP should be something a kid can master in one focused moment.
2. **Tight prereqs.** Only list prereqs without which the KP is genuinely incomprehensible.
   Over-listing prereqs turns the graph into a linear queue and makes retained curriculum harder to review.
3. **No exercises on the node.** The node says what must be mastered.
   Bit decides how to teach it each session.
   Mastery signals describe observable transitions, not drills.
4. **Language-blended.** HTML, CSS, and JS all live in the same graph.
   The kid never sees the labels.
5. **Stable id.** Once a KP ships, its `id` is forever.
   New concepts get new ids.
   Do not rename shipped ids.
6. **In v1 scope.** Do not propose anything network, async, modules, regex, TypeScript, or touch-event related unless the product scope has changed.

One file per KP belongs under `graph/nodes/<id>.yml`.
Follow the shape of the existing files.

## Adding A Dream

Dreams are retained buildable project ideas for Bit and future project flows.
The current v1 library ships 53 dreams, including the `playground` freeform dream.
Follow the shape of the existing files in `graph/dreams/`.

Review criteria:

1. **Real and achievable.** A `mode: project` dream is a real web project a 7-12 year old would actually want to build and could finish in one to a handful of sessions.
   A `mode: freeform` dream is an open-ended space for exploring, asking questions, or deciding what to build, not a disguised fixed project.
2. **Coverable by shipped KPs.** Every id in `requires:` must resolve to an existing `graph/nodes/*.yml`.
   If you need a KP that does not exist yet, add the KP in the same PR, but prefer reusing KPs.
   Only `mode: freeform` dreams may have an empty `requires:` list.
3. **Direct-use prereqs only.** Like KP prereqs, list the KPs the dream directly exercises.
   Do not include transitive prereqs that can be inferred from the graph.
4. **No difficulty field.** Do not author `difficulty` in `graph/dreams/*.yml`.
   The current Pi-backed app does not expose a dream rating.
5. **Categorized.** Use the `arcade | creative | personal | utility | art` enum.
   Multiple categories are fine.
   Adding a new category is a separate architectural change, not a dream PR.
6. **Interest tags are kid-facing labels.** Use words a kid would recognize, such as "music", "animals", or "space".
7. **Style hints describe open choices, not the build.** They exist so Bit can ask the kid what they want, not so the PR proposes a finished design.
8. **Unique id.** Kebab-case, stable forever once shipped.

One file per dream belongs under `graph/dreams/<id>.yml`.
Follow existing files such as `graph/dreams/beat-pad.yml` for shape.

## Adding To The System Prompt

`prompts/bit.md` and `prompts/bot.md` are the voice and pedagogy specs.
Changes there affect kid sessions and are reviewed with extra care.

## Review Process

- Push through `git push no-mistakes`, then let no-mistakes open the PR.
- Keep graph PRs small.
- One new KP, one new dream, or one tightly scoped cluster of related additions is usually enough for one graph PR.
- CI must be green.
- A maintainer reviews graph changes against the criteria above.
- Expect specific, concept-level feedback on KPs and dreams.
- The bar is "would we teach this to a real kid next week?"
- Graph-affecting changes are merged by the graph maintainer.
- Non-graph code can be merged by any maintainer with write access once no-mistakes, tests, and CI are green.

## What Not To PR

- LLM-generated KPs or dreams.
- Renames of shipped ids.
- Removals of shipped KPs or dreams without a migration story for existing local data.
- Whole new curricula such as Python, TypeScript, backend, or React.
- Auto-generated CHANGELOG edits or formatting-only churn in `graph/`.

## Licensing Of Contributions

By opening a PR you agree your contribution is licensed under the repo's MIT license.
Do not submit content you do not own or that is derived from incompatibly licensed sources.
