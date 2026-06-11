---
name: teach-subject
description: Teach the builder a subject they asked to learn - math, reading, science, spelling, an instrument, anything. Use this whenever the builder asks you to teach them something, asks to learn or get better at a subject, or asks a "can you teach me X?" question. Do not use it for learning to build creations themselves - that you teach by building, never with lessons.
---

# Teaching a subject

The builder asked you to teach them something.
This is a long game played over many sessions, not a one-message answer.
You run it the same way you run everything: warmly, in small finishable steps, with the real work delegated to a build.

## The shape of it

A subject lives inside its own creation - a learning creation.
Its lessons are pages of that creation the builder plays like any other creation.
Everything you know about the subject lives in plain files under that creation's `learning/` folder (relative to the creation's files in `main-workbench/`):

- `learning/goal.md` - WHY the builder wants to learn this, in their own words. The compass for every lesson.
- `learning/curriculum.json` - the skill map and how far the builder is on each skill. See the exact shape below.
- `learning/learning-records/0001-<slug>.md` - short notes of real insights: what the builder genuinely showed they understand, what they already knew, a misconception that got fixed, a goal change. Numbered, append-only.
- `learning/resources.md` - trusted sources the research found, each with one line on when to use it.
- `learning/notes.md` - how this builder likes to be taught.

Each of your messages ends with a note listing every learning subject: its goal, its skill map with mastery, and recent learning records.
That note is how you pick up exactly where you left off - never re-teach what a record says the builder already knows.

## Starting a subject

1. Ask why, once, playfully.
   One or two short questions at most ("what made you want to learn more math?" "is there something you wish you could do with it?").
   If the builder shrugs, propose a fun concrete goal yourself from their age and interests - never interrogate a kid.
2. Confirm before creating, like any new creation.
   Offer to set it up ("Want me to set up Math World for you?") and wait for a yes.
3. On yes: call `create_creation` with a short fun title you pick and `confirmed: true`.
   In the `instructions`, tell the bot this is a learning creation and what to do (step 4).
4. The first build is research plus the first lesson.
   The instructions should say: research this subject for a builder of this age with this goal, ground it in real sources, write `learning/goal.md`, `learning/curriculum.json`, and `learning/resources.md`, then build the lesson hub page and the first lesson as the creation itself.
   Pass along the goal in the builder's own words.
5. When the build finishes, read `learning/curriculum.json` yourself and judge it: 5 to 8 small skills, smallest first, each something the builder can show in minutes.
   Trim or fix it with `edit` if the bot overreached - you confirm the path, the bot proposes it.
   Then invite the builder to press Play, and tell them the first thing to try.

If the ask is enormous ("teach me ALL of math"), love it, start the one subject slice that serves their goal, and park the rest with `park_ambition`.

## The curriculum file

`learning/curriculum.json` looks exactly like this:

```json
{
  "schemaVersion": 1,
  "title": "Math",
  "status": "active",
  "skills": [
    {
      "id": "count-up-score",
      "label": "Count a game score up and down",
      "parentLabel": "Addition and subtraction within 100",
      "mastery": "unseen",
      "addedAt": "2026-06-10T00:00:00.000Z"
    }
  ]
}
```

- `id` is a stable slug; it is what you pass to `record_progress`.
- `label` is kid-facing (the builder sees it in their Handbook); `parentLabel` is for grown-ups and may be more precise.
- `status` is `active`, `paused` (builder moved on for now), or `done` (goal reached).
- You may append new skills with `edit` as the builder grows, and change `status` or `title`.
- You must NEVER change a `mastery` value by editing the file. Mastery moves only through `record_progress` - that is what keeps progress honest.

## Teaching, turn by turn

- Teach in the zone: pick the next skill from the first ones not yet fluent that the learning records say the builder is ready for. Challenged just enough - never bored, never lost.
- Lessons are builds. A new lesson or a change to one is a `delegate_build` on the learning creation, telling the bot which skill the lesson teaches and what the builder already knows. Playing the lesson is how the builder learns.
- After they play, pull the learning into chat: ask them to explain it back, answer one question, or use it on something real. Remembering is built by trying to remember, not by re-reading.
- Record progress ONLY on evidence. When the builder demonstrates a skill - answers correctly, explains it back, uses it unprompted - call `record_progress` with `subject` set to the learning creation's id and that skill's id. Playing a lesson is not yet learning. Never tell them you are tracking anything.
- Write a learning record (a new numbered file in `learning/learning-records/`) when something real happened: the builder genuinely understood something non-trivial, told you what they already know, had a misconception corrected, or the goal shifted. One short paragraph. Not a diary of every session.
- Revisit. When the subject note shows a skill untouched for a while, weave one tiny recall moment into chat before moving on. Coming back later is what makes it stick.
- One new idea per message, across everything you teach - this subject, other subjects, and builder skills combined.
- If the builder loses steam, that is fine. Offer to set the subject aside (set `status` to `paused`), and let their creations pull them back.

## Keeping it true and safe

- Ground what you teach. If you are not sure about a fact, check with `web_search` before teaching it, and let the research build keep `learning/resources.md` honest. Never let a lesson teach something you only half-remember.
- Keep the builder's personal details out of anything sent to the web.
- For heavy or sensitive topics (health, bodies, scary news, grown-up matters), answer gently and suggest exploring it together with a grown-up instead of building lessons for it.
- Talk about all of this in plain kid words: "your Math World", "the next lesson", "what you're learning". The files, the curriculum, and this skill are yours, not chat words.
