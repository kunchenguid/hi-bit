# Contributing to Hi-Bit

Hi-Bit is MIT-licensed and open to outside contributions. This doc covers the one part that needs its own rules: **the knowledge graph and dream library**. For code changes elsewhere (main/renderer, IPC, storage, UI), a normal PR against `main` with passing tests is enough.

## Ownership

The canonical knowledge graph under `graph/nodes/` and the dream library under `graph/dreams/` are hand-curated. Both are considered the core IP of the app and are maintained under a lightweight benevolent-dictator model:

- **Maintainer:** Kun Chen (@kunchenguid). Final say on what lands in `graph/`.
- **Everything else:** standard open-source review. Any maintainer with write access can merge non-graph PRs once tests pass and CI is green.

The graph is authored, not crowdsourced. Outside PRs are welcome, but the bar is deliberately high - see the review criteria below - because the scheduler and every shipped dream depend on the graph staying small and sharp.

## Before you open a PR

Run the relevant validators locally. All three are part of the test suite and CI:

```
npm test
```

In particular:

- `src/main/graph/load.test.ts` validates KP schema (required fields, `area` enum, mastery signals, DAG acyclicity, unresolved prereqs).
- `src/main/graph/dreams.test.ts` validates dream schema and cross-references each `requires:` id against the graph.
- `src/main/graph/shipped.test.ts` asserts the full shipped `graph/nodes/` + `graph/dreams/` parses, validates, and matches the expected id lists. Any new KP or dream must be added to the expected arrays in that file or the regression assertion will fail.

## Adding a knowledge point (KP)

The full spec lives in `docs/knowledge-graph.md`. Read it first. Summary of what reviewers look for:

1. **One sharp concept.** "CSS" is not a KP. "Changing the background color of a div" is a KP. A KP should be something a kid can master in one focused moment.
2. **Tight prereqs.** Only list prereqs without which the KP is genuinely incomprehensible. Over-listing prereqs turns the graph into a linear queue and kills the scheduler's flexibility.
3. **No exercises on the node.** The node says what must be mastered; Bit decides how to teach it each session. Mastery signals describe observable transitions, not drills.
4. **Language-blended.** HTML, CSS, and JS all live in the same graph. The kid never sees the labels.
5. **Stable id.** Once a KP ships, its `id` is forever. New concepts get new ids; do not rename.
6. **In v1 scope.** See the "Out of scope for v1" list in `docs/knowledge-graph.md` before proposing anything network, async, modules, regex, TypeScript, or touch-event related.

One file per KP under `graph/nodes/<id>.yml`, following the shape in `docs/knowledge-graph.md` §"Example complete nodes".

## Adding a dream

Dreams are buildable projects the kid can pick from Bit's dream menu. PRD target is 30-50 shipped dreams. Schema lives in `src/shared/dreams.ts`.

Review criteria:

1. **Real and achievable.** A dream is a real web project a 7-12 year old would actually want to build and could finish in one to a handful of sessions.
2. **Coverable by shipped KPs.** Every id in `requires:` must resolve to an existing `graph/nodes/*.yml`. If you need a KP that does not exist yet, add the KP in the same PR - but prefer reusing KPs.
3. **Direct-use prereqs only.** Like KP prereqs, list the KPs the dream directly exercises. The scheduler resolves transitive prereqs from the graph; you do not need to include them.
4. **Categorized.** Use the `arcade | creative | personal | utility | art` enum. Multiple categories are fine. Adding a new category is a separate architectural change, not a dream PR.
5. **Interest tags are kid-facing filters.** They drive the dream picker. Use words a kid would recognize ("music", "animals", "space"), not author-facing taxonomy.
6. **Style hints describe open choices, not the build.** They exist so Bit can ask the kid what they want, not so the PR proposes a finished design.
7. **Unique id.** Kebab-case, stable forever once shipped.

One file per dream under `graph/dreams/<id>.yml`. Follow existing files (e.g. `graph/dreams/beat-pad.yml`) for shape.

After adding the file, update the expected dream id list in `src/main/graph/shipped.test.ts` or the shipped-library test will fail.

## Adding to the system prompt

`prompts/bit.md` is the voice and pedagogy spec. Changes there affect every kid session and are reviewed with extra care. `src/main/storage/shippedPrompt.test.ts` maps the PRD-required behaviors to markers in the prompt - any change that removes a covered behavior will fail that test. If you are intentionally restructuring the prompt, update both the prompt and the markers in the same PR.

## Review process

- Open a PR against `main`.
- Keep graph PRs small. One new KP, one new dream, or one tightly scoped cluster of related additions. Large batch PRs get asked to split.
- CI must be green: `npm test` (vitest), `npx biome check` (lint + format), `npx tsc --noEmit` (typecheck).
- A maintainer reviews against the criteria above. Expect specific, concept-level feedback on KPs and dreams. The bar is "would we teach this to a real kid next week?"
- Graph-affecting changes are merged by the graph maintainer (currently @kunchenguid). Non-graph code can be merged by any maintainer with write access.

## What not to PR

- LLM-generated KPs or dreams. Every graph node is hand-reviewed. Submissions that read as generated will be closed.
- Renames of shipped ids.
- Removals of shipped KPs or dreams without a migration story for existing `progress.json` files.
- Whole new curricula (Python, TypeScript, backend, React). Out of scope for v1 per `PRD.md`.
- Auto-generated CHANGELOG edits or formatting-only churn in `graph/`.

## Licensing of contributions

By opening a PR you agree your contribution is licensed under the repo's MIT license. Do not submit content you do not own or that is derived from incompatibly licensed sources.
