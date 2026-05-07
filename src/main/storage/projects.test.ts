import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Dream } from "@shared/dreams";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, bootstrapProfileDirs, profilePathsFor } from "./layout";
import {
  listProjectFiles,
  listProjectSlugs,
  type ProjectFileChange,
  projectPathFor,
  readProjectFile,
  resolveProjectDir,
  scaffoldProject,
  watchProjectFiles,
  writeProjectFile,
} from "./projects";

function makeDream(overrides: Partial<Dream> = {}): Dream {
  return {
    id: "hello-card",
    title_parent: "Hello card",
    title_kid: "a hello card page",
    summary_kid: "a page that says hi",
    categories: ["creative"],
    interest_tags: [],
    requires: [],
    style_hints: [],
    emoji: "👋",
    ...overrides,
    difficulty: overrides.difficulty ?? 1,
  };
}

describe("projects storage", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-projects-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("projectPathFor", () => {
    it("composes the project dir under profile.projectsDir", () => {
      expect(projectPathFor(paths, "snake")).toBe(join(paths.projectsDir, "snake"));
    });

    it("rejects an empty slug", () => {
      expect(() => projectPathFor(paths, "")).toThrow(/slug/);
    });

    it.each([
      ["../escape"],
      [".hidden"],
      ["foo/bar"],
      ["foo\\bar"],
      [".."],
    ])("rejects unsafe slug %s", (slug) => {
      expect(() => projectPathFor(paths, slug)).toThrow(/slug/);
    });
  });

  describe("resolveProjectDir", () => {
    it("returns the project path for a valid slug", async () => {
      const dir = await resolveProjectDir(paths, "snake");
      expect(dir).toBe(join(paths.projectsDir, "snake"));
    });

    it("creates the project directory when it does not exist", async () => {
      const dir = await resolveProjectDir(paths, "snake");
      const stats = await stat(dir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("is idempotent when the directory already exists", async () => {
      const first = await resolveProjectDir(paths, "snake");
      const second = await resolveProjectDir(paths, "snake");
      expect(first).toBe(second);
      const stats = await stat(first);
      expect(stats.isDirectory()).toBe(true);
    });

    it("rejects an unsafe slug before touching disk", async () => {
      await expect(resolveProjectDir(paths, "../escape")).rejects.toThrow(/slug/);
    });
  });

  describe("listProjectFiles", () => {
    it("returns [] when the project dir does not exist yet", async () => {
      await expect(listProjectFiles(paths, "snake")).resolves.toEqual([]);
    });

    it("returns sorted file names for an existing project dir", async () => {
      const dir = projectPathFor(paths, "snake");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "style.css"), "body {}", "utf8");
      await writeFile(join(dir, "index.html"), "<!doctype html>", "utf8");
      await writeFile(join(dir, "snake.js"), "// snake", "utf8");
      await expect(listProjectFiles(paths, "snake")).resolves.toEqual([
        "index.html",
        "snake.js",
        "style.css",
      ]);
    });

    it("skips subdirectories in the flat listing", async () => {
      const dir = projectPathFor(paths, "snake");
      await mkdir(join(dir, "nested"), { recursive: true });
      await writeFile(join(dir, "index.html"), "<!doctype html>", "utf8");
      await expect(listProjectFiles(paths, "snake")).resolves.toEqual(["index.html"]);
    });
  });

  describe("listProjectSlugs", () => {
    it("returns [] when the projects dir does not exist yet", async () => {
      await rm(paths.projectsDir, { recursive: true, force: true });
      await expect(listProjectSlugs(paths)).resolves.toEqual([]);
    });

    it("returns [] when the projects dir exists but is empty", async () => {
      await expect(listProjectSlugs(paths)).resolves.toEqual([]);
    });

    it("returns sorted subdirectory names", async () => {
      await mkdir(join(paths.projectsDir, "snake"), { recursive: true });
      await mkdir(join(paths.projectsDir, "hello-card"), { recursive: true });
      await mkdir(join(paths.projectsDir, "pet-page"), { recursive: true });
      await expect(listProjectSlugs(paths)).resolves.toEqual(["hello-card", "pet-page", "snake"]);
    });

    it("skips regular files at the projects-dir top level", async () => {
      await mkdir(join(paths.projectsDir, "snake"), { recursive: true });
      await writeFile(join(paths.projectsDir, "stray.txt"), "x", "utf8");
      await expect(listProjectSlugs(paths)).resolves.toEqual(["snake"]);
    });

    it("skips entries with unsafe names", async () => {
      await mkdir(join(paths.projectsDir, ".hidden"), { recursive: true });
      await mkdir(join(paths.projectsDir, "ok-one"), { recursive: true });
      await expect(listProjectSlugs(paths)).resolves.toEqual(["ok-one"]);
    });
  });

  describe("readProjectFile / writeProjectFile", () => {
    it("writes content, creating the project dir when missing", async () => {
      await writeProjectFile(paths, "snake", "index.html", "<h1>hi</h1>\n");
      const raw = await readFile(join(paths.projectsDir, "snake", "index.html"), "utf8");
      expect(raw).toBe("<h1>hi</h1>\n");
    });

    it("roundtrips content through write then read", async () => {
      const content = "console.log('hello');\n";
      await writeProjectFile(paths, "snake", "snake.js", content);
      await expect(readProjectFile(paths, "snake", "snake.js")).resolves.toBe(content);
    });

    it("overwrites existing file content on repeat write", async () => {
      await writeProjectFile(paths, "snake", "index.html", "<p>v1</p>");
      await writeProjectFile(paths, "snake", "index.html", "<p>v2</p>");
      await expect(readProjectFile(paths, "snake", "index.html")).resolves.toBe("<p>v2</p>");
    });

    it.each([
      ["../escape.js"],
      [".hidden"],
      ["foo/bar.js"],
      [""],
    ])("rejects unsafe filename %s on write", async (name) => {
      await expect(writeProjectFile(paths, "snake", name, "x")).rejects.toThrow(/file name/);
    });

    it.each([
      ["../escape.js"],
      [".hidden"],
      ["foo/bar.js"],
      [""],
    ])("rejects unsafe filename %s on read", async (name) => {
      await expect(readProjectFile(paths, "snake", name)).rejects.toThrow(/file name/);
    });
  });

  describe("scaffoldProject", () => {
    it("creates index.html with the dream title in the project dir", async () => {
      const dream = makeDream({ id: "hello-card", title_kid: "a hello card page" });
      const result = await scaffoldProject(paths, dream, { profileName: "Ada" });
      expect(result).toEqual({ created: ["index.html"], skipped: [] });
      const raw = await readFile(join(paths.projectsDir, "hello-card", "index.html"), "utf8");
      expect(raw).toContain("<!doctype html>");
      expect(raw).toContain("<title>a hello card page</title>");
    });

    it("seeds the starter h1 with the profile name, not a generic Hello!", async () => {
      const dream = makeDream({ id: "hello-card", title_kid: "a hello card page" });
      await scaffoldProject(paths, dream, { profileName: "Eddie" });
      const raw = await readFile(join(paths.projectsDir, "hello-card", "index.html"), "utf8");
      expect(raw).not.toContain("<h1>Hello!</h1>");
      expect(raw).toContain("<h1>Eddie's page</h1>");
      expect(raw).toContain("Eddie");
    });

    it("sentence-cases the dream title in the starter paragraph", async () => {
      const dream = makeDream({ id: "hello-card", title_kid: "a hello card page" });
      await scaffoldProject(paths, dream, { profileName: "Ada" });
      const raw = await readFile(join(paths.projectsDir, "hello-card", "index.html"), "utf8");
      expect(raw).toContain("A hello card page");
    });

    it("seeds show me around with the generic first-edit name target", async () => {
      const dream = makeDream({
        id: "show-me-around",
        title_kid: "show me around",
        requires: ["run-and-preview"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "show-me-around", "index.html"), "utf8");

      expect(raw).toContain("<h1>My Name</h1>");
      expect(raw).not.toContain("<h1>Ada's page</h1>");
    });

    it("seeds pet page with the generic first-edit name target", async () => {
      const dream = makeDream({
        id: "pet-page",
        title_kid: "a page about a pet",
        requires: ["html-css-js-roles", "html-text-headings", "html-images"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "pet-page", "index.html"), "utf8");

      expect(raw).toContain("<h1>My Name</h1>");
      expect(raw).not.toContain("<h1>Ada's page</h1>");
    });

    it("reserves the first about-me paragraph for the learner to add", async () => {
      const dream = makeDream({
        id: "about-me",
        title_kid: "a page all about you",
        requires: ["html-text-headings", "html-text-paragraphs"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "about-me", "index.html"), "utf8");

      expect(raw).toContain("<h1>Ada's page</h1>");
      expect(raw).not.toContain("<p>A page all about you. Change anything to make it yours.</p>");
      expect(raw).not.toContain("<p>");
    });

    it("seeds one big title with an obvious editable title placeholder", async () => {
      const dream = makeDream({
        id: "first-heading",
        title_kid: "one big title",
        requires: ["html-text-headings"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "first-heading", "index.html"), "utf8");

      expect(raw).toContain("<h1>My Big Title</h1>");
      expect(raw).not.toContain("<h1>Ada's page</h1>");
    });

    it("gives the birthday card dream a starter page with a real card message and picture spot", async () => {
      const dream = makeDream({
        id: "birthday-card",
        title_kid: "a birthday card page",
        requires: ["html-text-headings", "html-text-paragraphs", "html-images", "css-colors"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "birthday-card", "index.html"), "utf8");

      expect(raw).toContain("Ada's birthday card");
      expect(raw).toContain("Happy Birthday!");
      expect(raw).toContain('<div class="picture-spot"');
      expect(raw).toContain("🎂");
      expect(raw).toContain("<style>");
      expect(raw).not.toContain("<h1>Ada's page</h1>");
      expect(raw).not.toContain("Change anything to make it yours.");
    });

    it("gives the smiley button dream a starter page with stuff, look, and action", async () => {
      const dream = makeDream({
        id: "emoji-button",
        title_kid: "a button with a smiley face",
        requires: ["html-buttons"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "emoji-button", "index.html"), "utf8");

      expect(raw).toContain("<button");
      expect(raw).toContain("Click me");
      expect(raw).toContain("<style>");
      expect(raw).toContain("<script>");
      expect(raw).toContain("addEventListener");
    });

    it("does not pre-fill the smiley button with the common first-edit choices", async () => {
      const dream = makeDream({
        id: "emoji-button",
        title_kid: "a button with a smiley face",
        requires: ["html-buttons"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "emoji-button", "index.html"), "utf8");

      expect(raw).not.toContain("Click me :D");
      expect(raw).not.toContain("Click me :)");
    });

    it("gives the click-me dream a starter page that already has buttons", async () => {
      const dream = makeDream({
        id: "click-me",
        title_kid: "a page with buttons to click",
        requires: ["html-text-headings", "html-buttons"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "click-me", "index.html"), "utf8");

      expect(raw).toContain("Ada's button page");
      expect(raw).toContain("<button");
      expect(raw).toContain("Play");
      expect(raw).toContain("Jump");
      expect(raw).toContain("Dance");
    });

    it("gives the click counter dream a starter page with a working counter button", async () => {
      const dream = makeDream({
        id: "click-counter",
        title_kid: "a page with a button that counts your clicks",
        requires: ["html-buttons", "dom-text-content", "events-click", "state-counter"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "click-counter", "index.html"), "utf8");

      expect(raw).toContain("Ada's click counter");
      expect(raw).toContain('<button id="count-button"');
      expect(raw).toContain('<p id="count-display"');
      expect(raw).toContain("let count = 0");
      expect(raw).toContain("count += 1");
      expect(raw).toContain("textContent");
      expect(raw).toContain("addEventListener");
    });

    it("gives the click rush dream a starter page with a timed mashing game", async () => {
      const dream = makeDream({
        id: "click-rush",
        title_kid: "a 10 second game where you mash a button as fast as you can",
        requires: ["html-buttons", "dom-text-content", "events-click", "timers-settimeout"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "click-rush", "index.html"), "utf8");

      expect(raw).toContain("Ada's click rush");
      expect(raw).toContain('<button id="start-button"');
      expect(raw).toContain('<button id="mash-button"');
      expect(raw).toContain('<p id="score"');
      expect(raw).toContain('<p id="timer"');
      expect(raw).toContain('<button id="reset-button"');
      expect(raw).toContain("let score = 0");
      expect(raw).toContain("let timeLeft = 10");
      expect(raw).toContain("setInterval");
      expect(raw).toContain("clearInterval");
      expect(raw).toContain("score += 1");
      expect(raw).toContain('addEventListener("click"');
    });

    it("gives the color changer dream a starter page with a button that changes the page color", async () => {
      const dream = makeDream({
        id: "color-changer",
        title_kid: "a page that changes color when you click",
        requires: ["html-buttons", "css-attach", "events-click"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "color-changer", "index.html"), "utf8");

      expect(raw).toContain("Ada's color changer");
      expect(raw).toContain('<button id="color-button"');
      expect(raw).toContain("backgroundColor");
      expect(raw).toContain("addEventListener");
    });

    it("gives the traffic light dream a starter page with lights and timer behavior", async () => {
      const dream = makeDream({
        id: "traffic-light",
        title_kid: "a traffic light that changes colors by itself",
        requires: ["html-div-span", "css-background", "css-border-radius", "timers-setinterval"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "traffic-light", "index.html"), "utf8");

      expect(raw).toContain("Ada's traffic light");
      expect(raw).toContain('<div class="traffic-light"');
      expect(raw).toContain('class="light red active"');
      expect(raw).toContain('class="light yellow"');
      expect(raw).toContain('class="light green"');
      expect(raw).toContain("setInterval");
      expect(raw).toContain("classList");
    });

    it("gives the beat pad dream a starter page with keyboard drum pads", async () => {
      const dream = makeDream({
        id: "beat-pad",
        title_kid: "four drum pads you play with the keyboard",
        requires: ["html-div-span", "events-keydown", "state-counter"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "beat-pad", "index.html"), "utf8");

      expect(raw).toContain("Ada's beat pad");
      expect(raw).toContain('class="pad"');
      expect(raw).toContain('data-key="a"');
      expect(raw).toContain('data-key="s"');
      expect(raw).toContain('data-key="d"');
      expect(raw).toContain('data-key="f"');
      expect(raw).toContain("keydown");
      expect(raw).toContain("classList");
      expect(raw).toContain("textContent");
    });

    it("does not build a beat pad selector from raw keyboard input", async () => {
      const dream = makeDream({
        id: "beat-pad",
        title_kid: "four drum pads you play with the keyboard",
        requires: ["html-div-span", "events-keydown", "state-counter"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "beat-pad", "index.html"), "utf8");

      expect(raw).not.toContain("document.querySelector('[data-key=\"' + key + '\"]')");
    });

    it("gives the dice roller dream a starter page with a working dice button", async () => {
      const dream = makeDream({
        id: "dice-roller",
        title_kid: "a page that rolls a dice when you click",
        requires: ["html-buttons", "dom-text-content", "events-click", "js-math-random"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "dice-roller", "index.html"), "utf8");

      expect(raw).toContain("Ada's dice roller");
      expect(raw).toContain('<button id="roll-button"');
      expect(raw).toContain('<p id="dice-result"');
      expect(raw).toContain("Math.random");
      expect(raw).toContain("textContent");
      expect(raw).toContain("addEventListener");
    });

    it("gives the random picker dream a starter page with choices and random pick behavior", async () => {
      const dream = makeDream({
        id: "random-picker",
        title_kid: "a picker that chooses one surprise",
        requires: ["js-arrays", "js-array-length", "js-math-random"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "random-picker", "index.html"), "utf8");

      expect(raw).toContain("Ada's surprise picker");
      expect(raw).toContain('<button id="pick-button"');
      expect(raw).toContain('<p id="pick-result"');
      expect(raw).toContain("const choices = [");
      expect(raw).toContain("choices.length");
      expect(raw).toContain("Math.random");
      expect(raw).toContain("textContent");
      expect(raw).toContain("addEventListener");
    });

    it("gives the message-button dream a starter page with a button and message behavior", async () => {
      const dream = makeDream({
        id: "message-button",
        title_kid: "a button that changes a message",
        requires: ["html-buttons", "dom-text-content", "events-click"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "message-button", "index.html"), "utf8");

      expect(raw).toContain("Ada's message button");
      expect(raw).toContain('<button id="message-button"');
      expect(raw).toContain('<p id="message"');
      expect(raw).toContain("textContent");
      expect(raw).toContain("addEventListener");
    });

    it("gives the magic answer dream a starter page with answer choices and button behavior", async () => {
      const dream = makeDream({
        id: "magic-answer",
        title_kid: "a page that gives you a magic answer to any question",
        requires: ["html-buttons", "dom-text-content", "events-click", "js-arrays"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "magic-answer", "index.html"), "utf8");

      expect(raw).toContain("Ada's magic answer");
      expect(raw).toContain('<button id="answer-button"');
      expect(raw).toContain('<p id="answer"');
      expect(raw).toContain("const answers = [");
      expect(raw).toContain("answers.length");
      expect(raw).toContain("Math.random");
      expect(raw).toContain("textContent");
      expect(raw).toContain("addEventListener");
    });

    it("gives the secret message dream a starter page with a hidden message and reveal button", async () => {
      const dream = makeDream({
        id: "secret-message",
        title_kid: "a page with a hidden message you reveal with a button",
        requires: ["html-buttons", "css-attach", "dom-class-toggle", "events-click"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "secret-message", "index.html"), "utf8");

      expect(raw).toContain("Ada's secret message");
      expect(raw).toContain('<button id="reveal-button"');
      expect(raw).toContain('<p id="secret-message"');
      expect(raw).toContain("hidden");
      expect(raw).toContain("classList");
      expect(raw).toContain('addEventListener("click"');
    });

    it("gives the type-mirror dream a starter page with a text box and mirrored text behavior", async () => {
      const dream = makeDream({
        id: "type-mirror",
        title_kid: "words that copy what you type",
        requires: ["html-inputs-text", "dom-input-value", "dom-text-content", "events-input"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "type-mirror", "index.html"), "utf8");

      expect(raw).toContain("Ada's type mirror");
      expect(raw).toContain('<label for="mirror-input"');
      expect(raw).toContain('<input id="mirror-input"');
      expect(raw).not.toContain('value="hello"');
      expect(raw).toContain('<p id="mirror-output"');
      expect(raw).toContain("Your words will show here.");
      expect(raw).toContain("input.value");
      expect(raw).toContain("textContent");
      expect(raw).toContain('addEventListener("input"');
    });

    it("gives the name badge dream a starter page with a text box and live badge text", async () => {
      const dream = makeDream({
        id: "name-badge",
        title_kid: "a name badge you can type into",
        requires: ["html-inputs-text", "dom-input-value", "dom-text-content", "events-input"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "name-badge", "index.html"), "utf8");

      expect(raw).toContain("Ada's name badge");
      expect(raw).toContain('<label for="name-input"');
      expect(raw).toContain('<input id="name-input"');
      expect(raw).toContain('<p id="badge-name"');
      expect(raw).toContain("Ada");
      expect(raw).toContain("input.value");
      expect(raw).toContain("textContent");
      expect(raw).toContain('addEventListener("input"');
    });

    it("gives the typing game dream a starter page with a word box and score behavior", async () => {
      const dream = makeDream({
        id: "typing-game",
        title_kid: "a game where you type words as fast as you can",
        requires: [
          "html-inputs-text",
          "dom-input-value",
          "dom-text-content",
          "events-input",
          "js-arrays",
          "state-counter",
        ],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "typing-game", "index.html"), "utf8");

      expect(raw).toContain("Ada's typing game");
      expect(raw).toContain('<p id="word-to-type"');
      expect(raw).toContain('<label for="typing-input"');
      expect(raw).toContain('<input id="typing-input"');
      expect(raw).toContain('<p id="score"');
      expect(raw).toContain("const words = [");
      expect(raw).toContain("let score = 0");
      expect(raw).toContain("input.value");
      expect(raw).toContain("score += 1");
      expect(raw).toContain('addEventListener("input"');
    });

    it("gives the to-do list dream a starter page with a text box and add behavior", async () => {
      const dream = makeDream({
        id: "to-do-list",
        title_kid: "a to do list where you type things and they show up",
        requires: ["html-inputs-text", "dom-input-value", "events-click", "dom-create-append"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "to-do-list", "index.html"), "utf8");

      expect(raw).toContain("Ada's to-do list");
      expect(raw).toContain('<label for="todo-input"');
      expect(raw).toContain('<input id="todo-input"');
      expect(raw).toContain('<button id="add-todo"');
      expect(raw).toContain('<ul id="todo-list"');
      expect(raw).toContain("document.createElement");
      expect(raw).toContain("input.value");
      expect(raw).toContain("append");
      expect(raw).toContain('addEventListener("click"');
    });

    it("gives the stopwatch dream a starter page with a startable timer", async () => {
      const dream = makeDream({
        id: "stopwatch",
        title_kid: "a stopwatch that counts up when you press start",
        requires: ["html-buttons", "dom-text-content", "events-click", "timers-setinterval"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "stopwatch", "index.html"), "utf8");

      expect(raw).toContain("Ada's stopwatch");
      expect(raw).toContain('<p id="time-display"');
      expect(raw).toContain('<button id="start-button"');
      expect(raw).toContain("let seconds = 0");
      expect(raw).toContain("setInterval");
      expect(raw).toContain("textContent");
      expect(raw).toContain('addEventListener("click"');
    });

    it("gives the rectangle dream a starter page with a canvas and rectangle drawing code", async () => {
      const dream = makeDream({
        id: "canvas-rectangle",
        title_kid: "draw one rectangle",
        requires: ["canvas-setup", "canvas-fillrect"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "canvas-rectangle", "index.html"), "utf8");

      expect(raw).toContain("Ada's drawing page");
      expect(raw).toContain("<canvas");
      expect(raw).toContain('getContext("2d")');
      expect(raw).toContain("fillRect");
    });

    it("gives the bouncing ball dream a starter page with a canvas and animation behavior", async () => {
      const dream = makeDream({
        id: "bouncing-ball",
        title_kid: "a ball that bounces around the screen",
        requires: [
          "canvas-setup",
          "canvas-circle",
          "canvas-clear",
          "animation-raf",
          "canvas-collision-bounds",
        ],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "bouncing-ball", "index.html"), "utf8");

      expect(raw).toContain("Ada's bouncing ball");
      expect(raw).toContain('<canvas id="ball-canvas"');
      expect(raw).toContain('getContext("2d")');
      expect(raw).toContain("arc(");
      expect(raw).toContain("clearRect");
      expect(raw).toContain("requestAnimationFrame");
      expect(raw).toContain("speedX *= -1");
      expect(raw).toContain("speedY *= -1");
    });

    it("html-escapes the profile name so it can't break out of the h1", async () => {
      const dream = makeDream({ id: "hello-card" });
      await scaffoldProject(paths, dream, { profileName: "<script>Mallory</script>" });
      const raw = await readFile(join(paths.projectsDir, "hello-card", "index.html"), "utf8");
      expect(raw).not.toContain("<script>Mallory</script>");
      expect(raw).toContain("&lt;script&gt;Mallory&lt;/script&gt;");
    });

    it("creates the project directory if missing", async () => {
      const dream = makeDream({ id: "pet-page" });
      await scaffoldProject(paths, dream, { profileName: "Ada" });
      await expect(listProjectFiles(paths, "pet-page")).resolves.toEqual(["index.html"]);
    });

    it("is idempotent: does not overwrite an existing index.html", async () => {
      const dream = makeDream({ id: "hello-card" });
      await writeProjectFile(paths, "hello-card", "index.html", "<p>kid's work</p>\n");
      const result = await scaffoldProject(paths, dream, { profileName: "Ada" });
      expect(result).toEqual({ created: [], skipped: ["index.html"] });
      await expect(readProjectFile(paths, "hello-card", "index.html")).resolves.toBe(
        "<p>kid's work</p>\n",
      );
    });

    it("creates project files for freeform dreams", async () => {
      const dream = makeDream({ id: "playground", mode: "freeform", requires: [] });
      const result = await scaffoldProject(paths, dream, { profileName: "Ada" });

      expect(result).toEqual({ created: ["index.html"], skipped: [] });
      await expect(listProjectFiles(paths, "playground")).resolves.toEqual(["index.html"]);
    });

    it("rejects a dream id that would be an unsafe slug", async () => {
      const dream = makeDream({ id: "../escape" });
      await expect(scaffoldProject(paths, dream, { profileName: "Ada" })).rejects.toThrow(/slug/);
    });
  });

  describe("watchProjectFiles", () => {
    async function waitFor<T>(
      accessor: () => T | null,
      {
        timeoutMs = 4000,
        intervalMs = 25,
        beforeRetry,
      }: { timeoutMs?: number; intervalMs?: number; beforeRetry?: () => Promise<void> } = {},
    ): Promise<T> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const value = accessor();
        if (value !== null) return value;
        if (Date.now() >= deadline) throw new Error("waitFor timed out");
        await beforeRetry?.();
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    it("creates the project dir if it does not exist yet", async () => {
      const events: ProjectFileChange[] = [];
      const watcher = await watchProjectFiles(paths, "snake", (e) => events.push(e));
      try {
        const dir = projectPathFor(paths, "snake");
        await expect(stat(dir).then((s) => s.isDirectory())).resolves.toBe(true);
      } finally {
        watcher.close();
      }
    });

    it("fires a change event when a file in the project dir is written", async () => {
      const events: ProjectFileChange[] = [];
      const watcher = await watchProjectFiles(paths, "snake", (e) => events.push(e));
      try {
        let writeCount = 0;
        await writeProjectFile(paths, "snake", "index.html", "<!doctype html>");
        const event = await waitFor(() => events.find((e) => e.filename === "index.html") ?? null, {
          beforeRetry: async () => {
            writeCount += 1;
            await writeProjectFile(paths, "snake", "index.html", `<!doctype html>${writeCount}`);
          },
        });
        expect(event.filename).toBe("index.html");
        expect(["changed", "renamed"]).toContain(event.kind);
      } finally {
        watcher.close();
      }
    });

    it("fires events for multiple files independently", async () => {
      const events: ProjectFileChange[] = [];
      const watcher = await watchProjectFiles(paths, "snake", (e) => events.push(e));
      try {
        let writeCount = 0;
        await writeProjectFile(paths, "snake", "index.html", "<!doctype html>");
        await writeProjectFile(paths, "snake", "snake.js", "// snake");
        await waitFor(
          () =>
            events.some((e) => e.filename === "index.html") &&
            events.some((e) => e.filename === "snake.js")
              ? true
              : null,
          {
            beforeRetry: async () => {
              writeCount += 1;
              await writeProjectFile(paths, "snake", "index.html", `<!doctype html>${writeCount}`);
              await writeProjectFile(paths, "snake", "snake.js", `// snake ${writeCount}`);
            },
          },
        );
      } finally {
        watcher.close();
      }
    });

    it("stops emitting events after close()", async () => {
      const events: ProjectFileChange[] = [];
      const watcher = await watchProjectFiles(paths, "snake", (e) => events.push(e));
      let writeCount = 0;
      await writeProjectFile(paths, "snake", "index.html", "<!doctype html>");
      await waitFor(() => (events.length > 0 ? true : null), {
        beforeRetry: async () => {
          writeCount += 1;
          await writeProjectFile(paths, "snake", "index.html", `<!doctype html>${writeCount}`);
        },
      });
      watcher.close();
      const countAtClose = events.length;
      await writeProjectFile(paths, "snake", "index.html", "<!doctype html><body>x</body>");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(events.length).toBe(countAtClose);
    });

    it("rejects an unsafe slug before opening a watcher", async () => {
      await expect(watchProjectFiles(paths, "../escape", () => {})).rejects.toThrow(/slug/);
    });
  });
});
