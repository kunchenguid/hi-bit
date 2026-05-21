# Contributing to Hi-Bit

Hi-Bit is MIT-licensed and open to outside contributions. This doc covers the one part that needs its own rules: **the knowledge graph and dream library**. For code changes elsewhere (main/renderer, IPC, storage, UI), a normal PR against `main` with passing tests is enough.

## Ownership

The canonical knowledge graph under `graph/nodes/` and the dream library under `graph/dreams/` are hand-curated. Both are considered the core IP of the app and are maintained under a lightweight benevolent-dictator model:

- **Maintainer:** Kun Chen (@kunchenguid). Final say on what lands in `graph/`.
- **Everything else:** standard open-source review. Any maintainer with write access can merge non-graph PRs once tests pass and CI is green.

The graph is authored, not crowdsourced. Outside PRs are welcome, but the bar is deliberately high - see the review criteria below - because the retained curriculum and every shipped dream depend on the graph staying small and sharp.

## Before you open a PR

Run the relevant validators locally. These match CI:

```
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

The current Pi-backed app does not ship a dedicated graph validator.
Keep graph and dream edits small enough for maintainer review, and do not rely on runtime validation to catch content mistakes.

## Adding a knowledge point (KP)

Summary of what reviewers look for:

1. **One sharp concept.** "CSS" is not a KP. "Changing the background color of a div" is a KP. A KP should be something a kid can master in one focused moment.
2. **Tight prereqs.** Only list prereqs without which the KP is genuinely incomprehensible. Over-listing prereqs turns the graph into a linear queue and makes retained curriculum harder to review.
3. **No exercises on the node.** The node says what must be mastered; Bit decides how to teach it each session. Mastery signals describe observable transitions, not drills.
4. **Language-blended.** HTML, CSS, and JS all live in the same graph. The kid never sees the labels.
5. **Stable id.** Once a KP ships, its `id` is forever. New concepts get new ids; do not rename.
6. **In v1 scope.** Do not propose anything network, async, modules, regex, TypeScript, or touch-event related unless the product scope has changed.

One file per KP under `graph/nodes/<id>.yml`, following the shape of the existing files.

## Adding a dream

Dreams are retained buildable project ideas for Bit and future project flows.
The current v1 library ships 53 dreams, including the `playground` freeform dream.
Follow the shape of the existing files in `graph/dreams/`.

Review criteria:

1. **Real and achievable.** A `mode: project` dream is a real web project a 7-12 year old would actually want to build and could finish in one to a handful of sessions.
   A `mode: freeform` dream is an open-ended space for exploring, asking questions, or deciding what to build, not a disguised fixed project.
2. **Coverable by shipped KPs.** Every id in `requires:` must resolve to an existing `graph/nodes/*.yml`. If you need a KP that does not exist yet, add the KP in the same PR - but prefer reusing KPs. Only `mode: freeform` dreams may have an empty `requires:` list.
3. **Direct-use prereqs only.** Like KP prereqs, list the KPs the dream directly exercises. Do not include transitive prereqs that can be inferred from the graph.
4. **No difficulty field.** Do not author `difficulty` in `graph/dreams/*.yml`; the current Pi-backed app does not expose a dream rating.
5. **Categorized.** Use the `arcade | creative | personal | utility | art` enum. Multiple categories are fine. Adding a new category is a separate architectural change, not a dream PR.
6. **Interest tags are kid-facing labels.** Use words a kid would recognize ("music", "animals", "space"), not author-facing taxonomy.
7. **Style hints describe open choices, not the build.** They exist so Bit can ask the kid what they want, not so the PR proposes a finished design.
8. **Unique id.** Kebab-case, stable forever once shipped.

One file per dream under `graph/dreams/<id>.yml`. Follow existing files (e.g. `graph/dreams/beat-pad.yml`) for shape.

## Adding to the system prompt

`prompts/bit.md` is the voice and pedagogy spec. Changes there affect every kid session and are reviewed with extra care.

## Review process

- Open a PR against `main`.
- Keep graph PRs small. One new KP, one new dream, or one tightly scoped cluster of related additions. Large batch PRs get asked to split.
- CI must be green: `pnpm check` (Biome lint + format), `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- A maintainer reviews against the criteria above. Expect specific, concept-level feedback on KPs and dreams. The bar is "would we teach this to a real kid next week?"
- Graph-affecting changes are merged by the graph maintainer (currently @kunchenguid). Non-graph code can be merged by any maintainer with write access.

## What not to PR

- LLM-generated KPs or dreams. Every graph node is hand-reviewed. Submissions that read as generated will be closed.
- Renames of shipped ids.
- Removals of shipped KPs or dreams without a migration story for existing local data.
- Whole new curricula (Python, TypeScript, backend, React). Out of scope for v1.
- Auto-generated CHANGELOG edits or formatting-only churn in `graph/`.

## Licensing of contributions

By opening a PR you agree your contribution is licensed under the repo's MIT license. Do not submit content you do not own or that is derived from incompatibly licensed sources.
