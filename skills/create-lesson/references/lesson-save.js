// GameSave - remember the builder's learning progress between visits.
//
// A lesson with no memory forgets which lessons are done, the quiz scores, and
// the streak the moment the builder leaves. Save it. GameSave uses the browser's
// localStorage, so it works the same wherever the creation is opened - inside
// Hi-Bit, or shared out on a real website - with no server and no setup. It is
// the same helper the game skills use, so saving feels identical everywhere.
//
//   GameSave.namespace("math-world");    // once, so two creations never mix saves
//   GameSave.save("progress", { done: ["0001"], streak: 3 });
//   const saved = GameSave.load("progress", { done: [], streak: 0 }); // fallback if none yet
//
// Save whenever something worth keeping changes (a lesson finished, a quiz
// passed, a streak extended), and load once when the page opens. Values can be
// any JSON: numbers, strings, arrays, objects. save() returns false if storage
// is blocked (it never throws).
const GameSave = (() => {
  let prefix = "game:"; // change with namespace() so each creation gets its own keys
  const keyFor = (name) => prefix + (name || "save");
  return {
    // Call once with your creation's name so its saves stay separate.
    namespace(name) {
      if (name) prefix = `${name}:`;
    },
    // Read the saved value for `name`, or `fallback` if nothing is saved yet.
    load(name, fallback = null) {
      try {
        const raw = localStorage.getItem(keyFor(name));
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    // Save any JSON-able value under `name`. Returns true if it was stored.
    save(name, value) {
      try {
        localStorage.setItem(keyFor(name), JSON.stringify(value));
        return true;
      } catch {
        return false; // storage full, blocked, or unavailable (e.g. some file:// modes)
      }
    },
    // Forget a saved value.
    clear(name) {
      try {
        localStorage.removeItem(keyFor(name));
      } catch {}
    },
  };
})();

// LessonProgress - the one save shape every lesson page and the hub share.
//
// Built on GameSave so lessons never invent their own keys. Two layers:
// - "progress": which lessons are done (the hub reads this).
// - "resume:<lessonId>": the checkpoint INSIDE a lesson - current question,
//   score, anything needed to continue exactly where the builder stopped.
//
//   LessonProgress.init("math-world");                       // once per page
//   const state = LessonProgress.resume("0001", { round: 1, score: 0 });
//   LessonProgress.checkpoint("0001", { round: 3, score: 20 }); // EVERY answer
//   LessonProgress.finish("0001", { bestScore: 50 });        // done + clears resume
//   LessonProgress.isDone("0001");                           // hub checkmarks
//   LessonProgress.summary();                                // { done: {...} }
const LessonProgress = (() => {
  const resumeKey = (lessonId) => `resume:${lessonId}`;
  return {
    // Call once per page with the creation's name (same as GameSave.namespace).
    init(name) {
      GameSave.namespace(name);
    },
    // Where the builder left off in this lesson, or `fallback` on a fresh start.
    resume(lessonId, fallback) {
      return GameSave.load(resumeKey(lessonId), fallback);
    },
    // Save the spot after EVERY answered question or completed step.
    checkpoint(lessonId, state) {
      return GameSave.save(resumeKey(lessonId), state);
    },
    // Mark the lesson done (with anything worth keeping, like a best score)
    // and clear the in-lesson checkpoint so a replay starts fresh.
    finish(lessonId, extras = {}) {
      const summary = GameSave.load("progress", { done: {} });
      summary.done[lessonId] = { ...(summary.done[lessonId] || {}), ...extras, doneAt: Date.now() };
      GameSave.clear(resumeKey(lessonId));
      return GameSave.save("progress", summary);
    },
    isDone(lessonId) {
      return Boolean(GameSave.load("progress", { done: {} }).done[lessonId]);
    },
    // Forget the checkpoint so the lesson starts over (a "Start over" button).
    restart(lessonId) {
      GameSave.clear(resumeKey(lessonId));
    },
    // Everything the hub needs to draw checkmarks and pick the next lesson.
    summary() {
      return GameSave.load("progress", { done: {} });
    },
  };
})();
