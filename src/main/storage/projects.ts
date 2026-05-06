import { type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dream } from "@shared/dreams";
import type { ProjectFileChange } from "@shared/project";
import type { ProfilePaths } from "./layout";

export type { ProjectFileChange, ProjectFileChangeKind } from "@shared/project";

const SAFE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function assertSafeSegment(label: string, value: string): void {
  if (!SAFE_NAME_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

export function projectPathFor(paths: ProfilePaths, slug: string): string {
  assertSafeSegment("project slug", slug);
  return join(paths.projectsDir, slug);
}

export async function resolveProjectDir(paths: ProfilePaths, slug: string): Promise<string> {
  const dir = projectPathFor(paths, slug);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function listProjectSlugs(paths: ProfilePaths): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(paths.projectsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const slugs = await Promise.all(
    entries.map(async (entry) => {
      if (!SAFE_NAME_PATTERN.test(entry)) return null;
      const stats = await stat(join(paths.projectsDir, entry)).catch(() => null);
      return stats?.isDirectory() ? entry : null;
    }),
  );
  return slugs.filter((s): s is string => s !== null).sort((a, b) => a.localeCompare(b));
}

export async function listProjectFiles(paths: ProfilePaths, slug: string): Promise<string[]> {
  const dir = projectPathFor(paths, slug);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const stats = await stat(join(dir, entry)).catch(() => null);
      return stats?.isFile() ? entry : null;
    }),
  );
  return files.filter((f): f is string => f !== null).sort((a, b) => a.localeCompare(b));
}

export async function readProjectFile(
  paths: ProfilePaths,
  slug: string,
  filename: string,
): Promise<string> {
  assertSafeSegment("project file name", filename);
  const dir = projectPathFor(paths, slug);
  return readFile(join(dir, filename), "utf8");
}

export async function writeProjectFile(
  paths: ProfilePaths,
  slug: string,
  filename: string,
  content: string,
): Promise<void> {
  assertSafeSegment("project file name", filename);
  const dir = projectPathFor(paths, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), content, "utf8");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sentenceCase(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function starterIndexHtml(dream: Dream, profileName: string): string {
  const rawTitle = dream.title_kid;
  const title = escapeHtml(rawTitle);
  const sentenceTitle = escapeHtml(sentenceCase(rawTitle));
  const name = escapeHtml(profileName);
  if (dream.id === "birthday-card") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #fff0f6;
        color: #4a1230;
      }

      .card {
        max-width: 30rem;
        margin: 2rem auto;
        padding: 2rem;
        border: 0.3rem solid #ff8a3d;
        border-radius: 1.5rem;
        background: #fffdf7;
      }

      .picture-spot {
        font-size: 4rem;
        margin: 1rem auto;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Happy Birthday!</h1>
      <div class="picture-spot" aria-label="birthday cake picture spot">🎂</div>
      <p>From ${name}'s birthday card.</p>
      <p>${sentenceTitle}. Change the message, picture, or colors to make it yours.</p>
    </main>
  </body>
</html>
`;
  }
  if (dream.id === "emoji-button") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #fff7d6;
      }

      button {
        font-size: 2rem;
        padding: 1rem 1.5rem;
        border-radius: 1rem;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s smiley button</h1>
    <p>${sentenceTitle}. Change the words or the smiley to make it yours.</p>
    <button id="smiley-button">Click me</button>
    <p id="message">Press the button to see what happens.</p>

    <script>
      const button = document.getElementById("smiley-button");
      const message = document.getElementById("message");

      button.addEventListener("click", () => {
        message.textContent = "The smiley button worked!";
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "click-me") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #eef7ff;
      }

      button {
        font-size: 1.2rem;
        margin: 0.5rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s button page</h1>
    <p>${sentenceTitle}. Change the button words to make them yours.</p>
    <button>Play</button>
    <button>Jump</button>
    <button>Dance</button>
  </body>
</html>
`;
  }
  if (dream.id === "click-counter") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #fff4e8;
      }

      button {
        font-size: 1.4rem;
        padding: 0.9rem 1.4rem;
        border-radius: 999px;
      }

      #count-display {
        font-size: 1.5rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s click counter</h1>
    <p>${sentenceTitle}. Press the button and watch the number go up.</p>
    <button id="count-button">Click me</button>
    <p id="count-display">Clicks: 0</p>

    <script>
      const button = document.getElementById("count-button");
      const display = document.getElementById("count-display");
      let count = 0;

      button.addEventListener("click", () => {
        count += 1;
        display.textContent = "Clicks: " + count;
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "color-changer") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: peachpuff;
      }

      button {
        font-size: 1.3rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s color changer</h1>
    <p>${sentenceTitle}. Press the button and watch the page paint itself.</p>
    <button id="color-button">Change the color</button>

    <script>
      const button = document.getElementById("color-button");
      const colors = ["peachpuff", "lightblue", "lightgreen", "lavender", "mistyrose"];
      let colorIndex = 0;

      button.addEventListener("click", () => {
        colorIndex = (colorIndex + 1) % colors.length;
        document.body.style.backgroundColor = colors[colorIndex];
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "traffic-light") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #eef3ff;
      }

      .traffic-light {
        width: 7rem;
        margin: 1rem auto;
        padding: 1rem;
        border-radius: 1.5rem;
        background: #222;
      }

      .light {
        width: 4rem;
        height: 4rem;
        margin: 0.6rem auto;
        border-radius: 50%;
        opacity: 0.25;
      }

      .red {
        background: red;
      }

      .yellow {
        background: gold;
      }

      .green {
        background: limegreen;
      }

      .active {
        opacity: 1;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s traffic light</h1>
    <p>${sentenceTitle}. Watch the active light change by itself.</p>
    <div class="traffic-light" aria-label="traffic light">
      <div class="light red active"></div>
      <div class="light yellow"></div>
      <div class="light green"></div>
    </div>

    <script>
      const lights = document.querySelectorAll(".light");
      let lightIndex = 0;

      setInterval(() => {
        lights[lightIndex].classList.remove("active");
        lightIndex = (lightIndex + 1) % lights.length;
        lights[lightIndex].classList.add("active");
      }, 1000);
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "beat-pad") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #1d1836;
        color: white;
      }

      .pads {
        display: grid;
        grid-template-columns: repeat(4, minmax(5rem, 1fr));
        gap: 1rem;
        max-width: 34rem;
        margin: 1.5rem auto;
      }

      .pad {
        padding: 1.4rem 0.8rem;
        border: 0.25rem solid white;
        border-radius: 1rem;
        background: #ff8a3d;
        color: #24102f;
        font-size: 1.4rem;
        font-weight: bold;
      }

      .pad.active {
        background: #ffd166;
        transform: scale(1.08);
      }

      #hit-count {
        font-size: 1.3rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s beat pad</h1>
    <p>${sentenceTitle}. Press A, S, D, or F and watch a pad flash.</p>
    <div class="pads">
      <div class="pad" data-key="a">A<br />Kick</div>
      <div class="pad" data-key="s">S<br />Clap</div>
      <div class="pad" data-key="d">D<br />Hat</div>
      <div class="pad" data-key="f">F<br />Boom</div>
    </div>
    <p id="hit-count">Hits: 0</p>

    <script>
      const pads = document.querySelectorAll(".pad");
      const hitCount = document.getElementById("hit-count");
      let hits = 0;

      document.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        const pad = document.querySelector('[data-key="' + key + '"]');
        if (pad === null) return;

        hits += 1;
        hitCount.textContent = "Hits: " + hits;
        pads.forEach((item) => item.classList.remove("active"));
        pad.classList.add("active");
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "dice-roller") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #f0f7ff;
      }

      button {
        font-size: 1.4rem;
        padding: 0.9rem 1.4rem;
        border-radius: 999px;
      }

      #dice-result {
        font-size: 3rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s dice roller</h1>
    <p>${sentenceTitle}. Press the button and watch the number change.</p>
    <p id="dice-result">1</p>
    <button id="roll-button">Roll the dice</button>

    <script>
      const button = document.getElementById("roll-button");
      const result = document.getElementById("dice-result");

      button.addEventListener("click", () => {
        const roll = Math.floor(Math.random() * 6) + 1;
        result.textContent = roll;
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "random-picker") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #fff9e8;
      }

      button {
        font-size: 1.3rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }

      #pick-result {
        font-size: 1.5rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s surprise picker</h1>
    <p>${sentenceTitle}. Press the button and let the page choose one surprise.</p>
    <button id="pick-button">Pick a surprise</button>
    <p id="pick-result">Your surprise will show here.</p>

    <script>
      const choices = ["dragon", "rainbow", "robot", "pizza"];
      const button = document.getElementById("pick-button");
      const result = document.getElementById("pick-result");

      button.addEventListener("click", () => {
        const index = Math.floor(Math.random() * choices.length);
        result.textContent = choices[index];
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "message-button") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #f6f0ff;
      }

      button {
        font-size: 1.3rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }

      #message {
        font-size: 1.4rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s message button</h1>
    <p>${sentenceTitle}. Change the button or message words to make it yours.</p>
    <button id="message-button">Show the message</button>
    <p id="message">Press the button to change this message.</p>

    <script>
      const button = document.getElementById("message-button");
      const message = document.getElementById("message");

      button.addEventListener("click", () => {
        message.textContent = "You changed the message!";
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "magic-answer") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #f8f0ff;
      }

      button {
        font-size: 1.3rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }

      #answer {
        font-size: 1.8rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s magic answer</h1>
    <p>${sentenceTitle}. Ask a question, press the button, and see what the page chooses.</p>
    <button id="answer-button">Give me an answer</button>
    <p id="answer">Your magic answer will show here.</p>

    <script>
      const answers = ["yes", "no", "maybe", "try again"];
      const button = document.getElementById("answer-button");
      const answer = document.getElementById("answer");

      button.addEventListener("click", () => {
        const index = Math.floor(Math.random() * answers.length);
        answer.textContent = answers[index];
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "secret-message") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #f2f7ff;
      }

      button {
        font-size: 1.3rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }

      .hidden {
        display: none;
      }

      #secret-message {
        font-size: 1.5rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s secret message</h1>
    <p>${sentenceTitle}. Press the button to reveal the hidden words.</p>
    <button id="reveal-button">Reveal the secret</button>
    <p id="secret-message" class="hidden">You found the secret!</p>

    <script>
      const button = document.getElementById("reveal-button");
      const message = document.getElementById("secret-message");

      button.addEventListener("click", () => {
        message.classList.toggle("hidden");
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "type-mirror") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #eefbf7;
      }

      input {
        display: block;
        font-size: 1.2rem;
        margin: 1rem auto;
        padding: 0.7rem 1rem;
        border-radius: 0.8rem;
      }

      #mirror-output {
        font-size: 1.5rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s type mirror</h1>
    <p>${sentenceTitle}. Type in the box and watch the page copy your words.</p>
    <label for="mirror-input">Type some words here:</label>
    <input id="mirror-input" type="text" />
    <p id="mirror-output">Your words will show here.</p>

    <script>
      const input = document.getElementById("mirror-input");
      const output = document.getElementById("mirror-output");

      input.addEventListener("input", () => {
        output.textContent = input.value;
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "name-badge") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #fff7f0;
      }

      input {
        display: block;
        font-size: 1.2rem;
        margin: 1rem auto;
        padding: 0.7rem 1rem;
        border-radius: 0.8rem;
      }

      .badge {
        display: inline-block;
        min-width: 12rem;
        padding: 1rem 1.5rem;
        border: 0.25rem solid #ff8a3d;
        border-radius: 1rem;
        background: white;
      }

      #badge-name {
        font-size: 2rem;
        font-weight: bold;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s name badge</h1>
    <p>${sentenceTitle}. Type a name and watch the badge change.</p>
    <label for="name-input">Type a name here:</label>
    <input id="name-input" type="text" value="${name}" />
    <div class="badge">
      <p>Hello, my name is</p>
      <p id="badge-name">${name}</p>
    </div>

    <script>
      const input = document.getElementById("name-input");
      const badgeName = document.getElementById("badge-name");

      input.addEventListener("input", () => {
        badgeName.textContent = input.value;
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "typing-game") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #f2f7ff;
      }

      input {
        display: block;
        font-size: 1.2rem;
        margin: 1rem auto;
        padding: 0.7rem 1rem;
        border-radius: 0.8rem;
      }

      #word-to-type {
        font-size: 2rem;
        font-weight: bold;
      }

      #score {
        font-size: 1.3rem;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s typing game</h1>
    <p>${sentenceTitle}. Type the shown word to score a point.</p>
    <p>Word to type:</p>
    <p id="word-to-type">cat</p>
    <label for="typing-input">Type the word here:</label>
    <input id="typing-input" type="text" />
    <p id="score">Score: 0</p>

    <script>
      const words = ["cat", "sun", "game", "jump"];
      const wordToType = document.getElementById("word-to-type");
      const input = document.getElementById("typing-input");
      const scoreDisplay = document.getElementById("score");
      let score = 0;
      let wordIndex = 0;

      input.addEventListener("input", () => {
        if (input.value === words[wordIndex]) {
          score += 1;
          wordIndex = (wordIndex + 1) % words.length;
          wordToType.textContent = words[wordIndex];
          scoreDisplay.textContent = "Score: " + score;
          input.value = "";
        }
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "to-do-list") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        max-width: 34rem;
        margin: 2rem auto;
        background: #f5fbff;
      }

      input,
      button {
        font-size: 1.1rem;
        padding: 0.7rem 1rem;
        border-radius: 0.8rem;
      }

      li {
        margin: 0.5rem 0;
        font-size: 1.2rem;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s to-do list</h1>
    <p>${sentenceTitle}. Type one thing, press the button, and watch it join the list.</p>
    <label for="todo-input">Type a thing to do:</label>
    <input id="todo-input" type="text" />
    <button id="add-todo">Add it</button>
    <ul id="todo-list">
      <li>Try Hi-Bit</li>
    </ul>

    <script>
      const input = document.getElementById("todo-input");
      const button = document.getElementById("add-todo");
      const list = document.getElementById("todo-list");

      button.addEventListener("click", () => {
        const text = input.value.trim();
        if (text === "") return;

        const item = document.createElement("li");
        item.textContent = text;
        list.append(item);
        input.value = "";
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "stopwatch") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #f0f7ff;
      }

      #time-display {
        font-size: 3rem;
        font-weight: bold;
      }

      button {
        font-size: 1.2rem;
        padding: 0.8rem 1.2rem;
        border-radius: 999px;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s stopwatch</h1>
    <p>${sentenceTitle}. Press start and watch the seconds count up.</p>
    <p id="time-display">0 seconds</p>
    <button id="start-button">Start</button>

    <script>
      const display = document.getElementById("time-display");
      const button = document.getElementById("start-button");
      let seconds = 0;
      let timerId = null;

      button.addEventListener("click", () => {
        if (timerId !== null) return;

        timerId = setInterval(() => {
          seconds += 1;
          display.textContent = seconds + " seconds";
        }, 1000);
      });
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "canvas-rectangle") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        text-align: center;
        background: #fff4ea;
      }

      canvas {
        background: white;
        border: 4px solid #25304f;
        border-radius: 1rem;
      }
    </style>
  </head>
  <body>
    <h1>${name}'s drawing page</h1>
    <p>${sentenceTitle}. Change the color or numbers to make it yours.</p>
    <canvas id="drawing" width="320" height="220"></canvas>

    <script>
      const canvas = document.getElementById("drawing");
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "tomato";
      ctx.fillRect(70, 50, 180, 110);
    </script>
  </body>
</html>
`;
  }
  if (dream.id === "show-me-around" || dream.id === "pet-page") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1>My Name</h1>
    <p>${sentenceTitle}. Change anything to make it yours.</p>
  </body>
</html>
`;
  }
  if (dream.id === "first-heading") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1>My Big Title</h1>
    <p>${sentenceTitle}. Change this title to make it yours.</p>
  </body>
</html>
`;
  }
  if (dream.id === "about-me") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1>${name}'s page</h1>
  </body>
</html>
`;
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1>${name}'s page</h1>
    <p>${sentenceTitle}. Change anything to make it yours.</p>
  </body>
</html>
`;
}

export type ProjectFileWatcher = { close: () => void };

export async function watchProjectFiles(
  paths: ProfilePaths,
  slug: string,
  onChange: (event: ProjectFileChange) => void,
): Promise<ProjectFileWatcher> {
  const dir = projectPathFor(paths, slug);
  await mkdir(dir, { recursive: true });
  let watcher: FSWatcher;
  try {
    watcher = watch(dir, { persistent: false, encoding: "utf8" });
  } catch (err) {
    throw new Error(
      `Could not watch project ${slug}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  watcher.on("change", (eventType, filename) => {
    if (typeof filename !== "string" || filename.length === 0) return;
    if (!SAFE_NAME_PATTERN.test(filename)) return;
    onChange({
      kind: eventType === "rename" ? "renamed" : "changed",
      filename,
    });
  });
  watcher.on("error", () => {
    /* swallow: watcher goes dead when the dir is removed; callers close explicitly */
  });
  return {
    close: () => {
      watcher.close();
    },
  };
}

export type ScaffoldResult = { created: string[]; skipped: string[] };

export type ScaffoldOptions = { profileName: string };

export async function scaffoldProject(
  paths: ProfilePaths,
  dream: Dream,
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const dir = projectPathFor(paths, dream.id);
  await mkdir(dir, { recursive: true });
  const files: Array<{ name: string; content: string }> = [
    { name: "index.html", content: starterIndexHtml(dream, options.profileName) },
  ];
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { name, content } of files) {
    const target = join(dir, name);
    const exists = await stat(target)
      .then(() => true)
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return false;
        throw err;
      });
    if (exists) {
      skipped.push(name);
    } else {
      await writeFile(target, content, "utf8");
      created.push(name);
    }
  }
  return { created, skipped };
}
