---
name: create-lesson
description: Research a learning subject and build interactive lessons for a kid's learning creation - the job mentions a learning creation, lessons, teaching a subject, a learning/ folder, or files like goal.md, curriculum.json, or resources.md. Use this for both kinds of learning job - the first research-and-curriculum build and every later build-a-lesson or change-a-lesson job.
---

# Create lessons

Use this skill when the job is teaching: researching a subject the builder asked Bit to teach, or building the lesson pages that teach it.
A learning creation is an ordinary creation whose pages are lessons; the builder learns by playing them.

## The learning folder

The subject's state lives in plain files under `learning/` (inside the creation's files, beside `index.html`):

- `learning/goal.md` - WHY the builder is learning this, in their own words. Every lesson must serve it.
- `learning/curriculum.json` - the skill map. Exact shape:

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

- `learning/learning-records/0001-<slug>.md` - short notes of what the builder genuinely knows. Read them before designing a lesson; never re-teach what a record says is known.
- `learning/resources.md` - the trusted sources behind the lessons, each with one line on what it covers.
- `learning/notes.md` - the builder's starting point and how they like to be taught.

Hard rule: NEVER change a skill's `mastery` value.
Mastery is advanced only by Bit through its progress tool; your edits to `curriculum.json` may add skills or fix labels, nothing else.

## Research jobs (the first build)

When the job asks you to research the subject and set the creation up:

1. Use the starting point Bit gives you.
   Do not automatically begin at the earliest prerequisite just because it is first in a standard curriculum.
   If the builder says basics are easy, start the curriculum at the first skill that stretches them, and keep prerequisite basics as quick checks or reference cards instead of full lessons.
   If Bit gives no starting point, use the builder's age and goal to choose a warm starter, but include a tiny warm-up that can reveal if the lesson should jump harder.
2. Ground yourself in real sources first.
   Use `web_search` (and `fetch_content` on the good hits) to find how this subject is actually taught to kids of this age, goal, and starting point - the natural order, the common stumbling blocks, and the sizes of step that work.
   Never design a curriculum from memory alone, and never teach a fact you have not checked.
   The builder is waiting for this build, so keep the research tight: a few searches and the best one or two pages, enough to trust the skill order - not a survey of everything.
   Keep the builder's name and personal details out of every query.
3. Write `learning/goal.md` from the goal in the job (if Bit has not already), `learning/resources.md` from what you found, `learning/notes.md` with the starting point Bit gave you, and `learning/curriculum.json` with 5 to 8 small skills, every `mastery` set to `"unseen"`.
   Each skill should be demonstrable in minutes and `label`ed in plain kid words; use `parentLabel` for the precise grown-up name.
   Tie the skill order to the goal and starting level: the builder should touch their actual wish ("score math for my games") by skill two or three, not after a semester of basics they already know.
4. Build the lesson hub (`index.html`) and the FIRST lesson only, per the lesson rules below.
   The first lesson teaches only the first skill in the curriculum - one skill slice, like every lesson.
   It should start just above what already feels easy, with a quick success path and a harder branch if the warm-up is too easy.
   Never build later lesson pages in a research job, no matter how clear the road ahead looks: the builder starts playing the moment this build lands, and each next lesson arrives as its own later build, shaped by what the builder shows along the way.

## Lesson jobs (every later build)

The job names the skill to teach and what the builder already knows.
Respect that starting point: never re-teach a skill that a learning record or Bit's instructions say is already easy, unless the lesson uses it as a quick check before moving into the new challenge.
One lesson teaches one skill slice - a single tangible win the builder can reach in a few minutes.

- The hub (`index.html`) is the creation's front page: the subject's name, the lessons in order, which are done (from the save), and a friendly nudge to the next one.
  Only lessons that actually exist are links; show the curriculum skills whose lessons are not built yet as unclickable "coming soon" cards, so the builder sees the road ahead without ever hitting a dead link.
  Never build extra lessons just to fill the hub.
- Each lesson is one self-contained page under `lessons/` (e.g. `lessons/0001-counting-score.html`), linked from the hub, numbered in order.
- Teach a tiny bit, then make the builder DO it.
  The doing is the lesson: an interactive challenge with immediate, automatic feedback - a question answered, a thing dragged, a number typed, a mini-game round.
  Remembering is built by trying to remember, so prefer recall ("type the answer") over recognition wherever the builder can manage it.
- Quiz rules: feedback right on the click (never a submit-and-wait), wrong answers explained kindly, and answer options the SAME length and style so the right one never stands out by its shape.
- Mix in one or two quick review questions from earlier lessons (spacing beats cramming), and end every lesson with a clear win the builder can feel.
- Reading level follows the builder's age in the job: short sentences, plain words, big friendly type.
- Reference pages (a glossary, a cheat sheet, a times table) go under `reference/`, linked from the hub and from lessons - they are what the builder comes back to later. Keep their wording consistent across every lesson.
- No external links anywhere: the preview can only show the creation itself, so an outside link is a dead button. The sources stay in `learning/resources.md` for grown-ups.
- A lesson job usually runs while the builder is playing and Bit is recording their progress into `learning/curriculum.json`.
  Do not edit `curriculum.json` (or any other `learning/` file) in a lesson job unless the job explicitly asks for it - overlapping edits to those files can jam the install.

## Never lose the builder's progress

A lesson with no memory forgets the question the builder was on, the score they earned, and every checkmark the moment the app closes.
Nothing frustrates a kid faster.
`references/lesson-save.js` gives you `GameSave` plus `LessonProgress`, the one save shape every page shares - copy it into the creation and load it on the hub and on every lesson page.

1. Once, near the top of every page, name the creation so its saves stay separate: `LessonProgress.init("math-world")`.
2. When a page opens, RESTORE FIRST, before anything renders as new:
   - the hub draws its checkmarks and "next lesson" nudge from `LessonProgress.summary()` and `isDone(id)`;
   - a lesson loads its checkpoint with `const state = LessonProgress.resume("0001", { round: 1, score: 0 })` and continues exactly there - same question, same score - never silently back at question one.
3. After EVERY answered question or completed step - not just at the end - save the spot: `LessonProgress.checkpoint("0001", { round, score })`. A kid closes the app mid-lesson all the time; whatever happened since the last checkpoint is lost, so checkpoint every step that matters.
4. When the lesson is finished, `LessonProgress.finish("0001", { bestScore })` marks it done for the hub and clears the checkpoint so a replay starts fresh.
5. Resuming should never trap the builder: give a lesson with a checkpoint a small "Start over" affordance that calls `LessonProgress.restart("0001")`.

State can be any JSON (the current round, score, which answers were used); save the small facts needed to continue, not the whole DOM.

## Make it feel like Hi-Bit

- Lessons fill the whole screen responsively (100vw/100vh, no scrolling) unless a page genuinely needs to scroll.
- Real art comes from `generate_image` (and the `game-assets` skill for animated or transparent sprites) - a lesson with one friendly illustration beats a wall of text. Never draw art with code.
- Try it like the builder would with your headless browser (`browser_open_tab`, `browser_click`, `browser_read`): open the hub, take the lesson, answer wrong on purpose once, and confirm the feedback behaves.
- Then prove the memory works before you finish: answer one question, reload the page (`browser_reload` or re-navigate), and confirm the lesson resumes at the same question with the same score. If it restarts from the beginning, the lesson is not done.
