# Stale Lesson-Ahead Validation

This evidence validates the real-user upgrade case where an existing learning subject has stale Bit session memory of the old `teach-subject` skill.
The exercised surface is the coordinator-level Bit turn and bot completion flow, which is where the end-user chat behavior is decided.

## User Flow Exercised

1. A builder already has a learning creation with `learning/curriculum.json` and lesson pages on disk.
2. The Bit session history is stale and still contains the older skill behavior that did not know the chat-turn one-lesson-ahead rule.
3. The per-turn subjects note detects the built lesson pages from the creation files.
4. When the builder says they reached the newest built lesson, Bit sees the code-computed next lesson state and delegates exactly one next lesson build.
5. That delegated lesson build is instructed not to edit `learning/curriculum.json`.
6. When the later lesson build completes, the completion path tells Bit not to delegate another build, preserving the no-runaway-chain behavior.

## Prompt Evidence

The tested stale chat-turn prompt contains the deterministic lesson state that does not depend on the stale session's remembered skill text.

```text
Built lesson skills: count-up-score, add-two-digit
Newest built lesson: add-two-digit (lesson 2)
Next unbuilt lesson: subtract-spending
One-ahead chat trigger: if this turn shows the builder reached, played, or finished the newest built lesson, call delegate_build exactly once now for the next unbuilt lesson.
```

The test handler only delegates when that note is present, and the delegated build instructions include this guard.

```text
Build the next lesson. This is a lesson job and must not edit learning/curriculum.json.
```

The tested later completion prompt contains the stop instruction that prevents chaining another build from completion.

```text
Tell the builder this lesson is waiting, but do NOT delegate another build now, even if earlier turns did: the next lesson starts only from a chat turn where the builder has reached the newest lesson.
```

## Commands Run

```bash
pnpm vitest run src/main/bit/bitCoordinatorService.test.ts --testNamePattern "subjects|lesson state|one-ahead|completion|teach-subject|learning subjects"
pnpm vitest run src/main/pi/piResources.test.ts src/main/projects/subjectFiles.test.ts src/shared/subjects.test.ts
```

Both targeted test commands passed.

## Why No Screenshot

This change affects Bit's prompt context, bot delegation, and persisted learning-subject file interpretation rather than a renderer layout or copy-placement surface.
The reviewer-visible evidence is therefore the prompt surface and delegated job instruction from the end-to-end coordinator flow rather than a UI screenshot.
