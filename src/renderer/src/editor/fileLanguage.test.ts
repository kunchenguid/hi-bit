import { describe, expect, it } from "vitest";
import { detectEditorLanguage } from "./fileLanguage";

describe("detectEditorLanguage", () => {
  it("detects html from .html", () => {
    expect(detectEditorLanguage("index.html")).toBe("html");
  });

  it("detects html from .htm", () => {
    expect(detectEditorLanguage("page.htm")).toBe("html");
  });

  it("detects css from .css", () => {
    expect(detectEditorLanguage("style.css")).toBe("css");
  });

  it("detects javascript from .js", () => {
    expect(detectEditorLanguage("snake.js")).toBe("javascript");
  });

  it("detects javascript from .mjs and .cjs", () => {
    expect(detectEditorLanguage("game.mjs")).toBe("javascript");
    expect(detectEditorLanguage("util.cjs")).toBe("javascript");
  });

  it("is case-insensitive for the extension", () => {
    expect(detectEditorLanguage("README.HTML")).toBe("html");
    expect(detectEditorLanguage("Style.CSS")).toBe("css");
  });

  it("returns null for files with no extension", () => {
    expect(detectEditorLanguage("README")).toBeNull();
  });

  it("returns null for trailing-dot filenames", () => {
    expect(detectEditorLanguage("weird.")).toBeNull();
  });

  it("returns null for unknown extensions", () => {
    expect(detectEditorLanguage("notes.md")).toBeNull();
    expect(detectEditorLanguage("picture.png")).toBeNull();
    expect(detectEditorLanguage("data.json")).toBeNull();
  });
});
