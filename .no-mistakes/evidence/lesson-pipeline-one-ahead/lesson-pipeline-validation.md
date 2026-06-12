# Lesson Pipeline One-Ahead Validation

This evidence validates the learning-subject pipeline behavior from the coordinator-level test harness, which exercises Bit turns, bot completion turns, persisted learning creation files, and bot job records.

## User-facing Flow Exercised

1. A builder asks Bit to teach a subject.
2. Bit delegates a learning-creation build.
3. The first bot completion is marked playable with `[[READY_TO_PLAY]]`.
4. Bit's completion prompt explicitly starts Play and chains only the second lesson.
5. A later bot completion is marked playable.
6. Bit's later completion prompt explicitly forbids delegating another build, preventing the runaway lesson chain.
7. A poisoned-session variant corrupts a completed job file; the completion prompt still forbids another build.
8. A stale chat-turn variant keeps an old pre-one-ahead `teach-subject` skill read in session history, detects built lesson files from the learning creation, and delegates exactly one next lesson from the per-turn subjects note.

## Evidence From Tested Prompt Surface

The tested first-build completion prompt contains these behavioral instructions:

```text
Read the teach-subject skill and follow its "After a learning build finishes" steps in this same turn: review and trim learning/curriculum.json yourself first, invite Play, then delegate the second lesson's build so it is ready while the builder plays.
```

The tested later-build completion prompt contains this stop instruction:

```text
Tell the builder this lesson is waiting, but do NOT delegate another build now, even if earlier turns did: the next lesson starts only from a chat turn where the builder has reached the newest lesson.
```

The unreadable-job-file guard returns the same later-build stop instruction, so a read hiccup cannot reclassify the completion as the first build and unleash a chain.

The tested stale chat-turn prompt contains the deterministic lesson state and go signal even when the current skill has not been read in that session:

```text
Built lesson skills: count-up-score, add-two-digit
Newest built lesson: add-two-digit (lesson 2)
Next unbuilt lesson: subtract-spending
One-ahead chat trigger: if this turn shows the builder reached, played, or finished the newest built lesson, call delegate_build exactly once now for the next unbuilt lesson.
```

The test handler delegates only when that note is present, and the later completion prompt still says `do NOT delegate another build`.

## Commands Run

```bash
pnpm vitest run src/main/bit/bitCoordinatorService.test.ts --testNamePattern "subjects|lesson state|one-ahead|completion|teach-subject|learning subjects"
pnpm vitest run src/main/pi/piResources.test.ts src/main/projects/subjectFiles.test.ts src/shared/subjects.test.ts
```

Both targeted test commands passed.

## Why No Screenshot

This change affects Bit and bot instruction flow plus persisted learning-subject state, not a renderer layout or copy-placement surface.
The reviewer-visible evidence is therefore the prompt surface Bit receives during the end-to-end coordinator flow rather than a UI screenshot.
