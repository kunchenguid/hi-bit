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

    it("gives the smiley button dream a starter page with stuff, look, and action", async () => {
      const dream = makeDream({
        id: "emoji-button",
        title_kid: "a button with a smiley face",
        requires: ["html-buttons"],
      });
      await scaffoldProject(paths, dream, { profileName: "Ada" });

      const raw = await readFile(join(paths.projectsDir, "emoji-button", "index.html"), "utf8");

      expect(raw).toContain("<button");
      expect(raw).toContain(":D");
      expect(raw).toContain("<style>");
      expect(raw).toContain("<script>");
      expect(raw).toContain("addEventListener");
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
      { timeoutMs = 4000, intervalMs = 25 }: { timeoutMs?: number; intervalMs?: number } = {},
    ): Promise<T> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const value = accessor();
        if (value !== null) return value;
        if (Date.now() >= deadline) throw new Error("waitFor timed out");
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
        await writeProjectFile(paths, "snake", "index.html", "<!doctype html>");
        const event = await waitFor(() => events.find((e) => e.filename === "index.html") ?? null);
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
        await writeProjectFile(paths, "snake", "index.html", "<!doctype html>");
        await writeProjectFile(paths, "snake", "snake.js", "// snake");
        await waitFor(() =>
          events.some((e) => e.filename === "index.html") &&
          events.some((e) => e.filename === "snake.js")
            ? true
            : null,
        );
      } finally {
        watcher.close();
      }
    });

    it("stops emitting events after close()", async () => {
      const events: ProjectFileChange[] = [];
      const watcher = await watchProjectFiles(paths, "snake", (e) => events.push(e));
      await writeProjectFile(paths, "snake", "index.html", "<!doctype html>");
      await waitFor(() => (events.length > 0 ? true : null));
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
