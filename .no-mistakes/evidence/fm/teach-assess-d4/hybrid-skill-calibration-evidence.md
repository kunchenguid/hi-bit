# Hybrid Skill-Level Calibration Evidence

Validated user intent: Bit should calibrate a new subject with a hybrid approach before setup, then pass that starting point to lesson bots so lessons start near the builder's actual level instead of defaulting to basics.

## End-user flow demonstrated

1. Builder asks Bit to teach a subject.
2. Bit must learn why the builder wants it and what already feels easy or hard before creating the learning creation.
3. Bit confirms the setup using that starting point.
4. The first lesson bot receives the builder's goal, starting level, known skills, and what not to re-teach.
5. The lesson bot builds a curriculum and first lesson from that starting point, using quick checks and harder branches instead of a basics-first path.

## Runtime-facing Bit prompt

Source: `src/main/pi/piResources.ts` / `prompts/bit.md`

> For a brand-new subject, do not create or delegate yet until you know both why the builder wants it and roughly what already feels easy or hard. Ask at most one playful starting-point question, or infer from profile notes and confirm, then follow teach-subject.

## Bit teach-subject skill

Source: `skills-bit/teach-subject/SKILL.md`

> Find the starting point before setup. Use anything you already know first: the builder's age, interests, parent notes, this conversation, and any existing subject note for this subject. Then ask at most one playful calibration question that learns BOTH why they care and what already feels easy or hard.

> If the builder already told you their level, do not ask again; reflect your guess and confirm quickly.

> In the `instructions`, tell the bot this is a learning creation, the builder's goal, the starting level, what they said they already know, and what should NOT be re-taught.

## Lesson bot create-lesson skill

Source: `skills/create-lesson/SKILL.md`

> Use the starting point Bit gives you. Do not automatically begin at the earliest prerequisite just because it is first in a standard curriculum.

> If the builder says basics are easy, start the curriculum at the first skill that stretches them, and keep prerequisite basics as quick checks or reference cards instead of full lessons.

> It should start just above what already feels easy, with a quick success path and a harder branch if the warm-up is too easy.

> Respect that starting point: never re-teach a skill that a learning record or Bit's instructions say is already easy, unless the lesson uses it as a quick check before moving into the new challenge.

## Automated verification

Command: `pnpm test src/main/pi/piResources.test.ts`

Result: Passed.

The focused test file verifies that Bit loads the curated `teach-subject` skill, that the skill contains the starting-point calibration requirements, that lesson bots load `create-lesson`, and that the lesson skill honors Bit's starting point instead of defaulting to prerequisites.
