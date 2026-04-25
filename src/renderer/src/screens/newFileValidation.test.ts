import { describe, expect, it } from "vitest";
import { ALLOWED_NEW_FILE_EXTENSIONS, validateNewFilename } from "./newFileValidation";

describe("validateNewFilename", () => {
  it("rejects an empty name", () => {
    const result = validateNewFilename("", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/type a filename/i);
    }
  });

  it("rejects a whitespace-only name", () => {
    const result = validateNewFilename("   ", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/type a filename/i);
    }
  });

  it("rejects a name with spaces", () => {
    const result = validateNewFilename("my file.html", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/letters, numbers/i);
    }
  });

  it("rejects a name with path separators", () => {
    const result = validateNewFilename("../index.html", []);
    expect(result.ok).toBe(false);
  });

  it("rejects a name without an extension", () => {
    const result = validateNewFilename("index", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/extension/i);
    }
  });

  it("rejects a name whose extension is not html/css/js", () => {
    const result = validateNewFilename("notes.txt", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/html.*css.*js/i);
    }
  });

  it("rejects a leading-dot name (no stem)", () => {
    const result = validateNewFilename(".html", []);
    expect(result.ok).toBe(false);
  });

  it("rejects a trailing-dot name (no extension)", () => {
    const result = validateNewFilename("index.", []);
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate filename (case-insensitive)", () => {
    const result = validateNewFilename("Index.HTML", ["index.html"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already exists/i);
    }
  });

  it("accepts a valid .html name", () => {
    expect(validateNewFilename("index.html", [])).toEqual({ ok: true, name: "index.html" });
  });

  it("accepts a valid .css name with surrounding whitespace", () => {
    expect(validateNewFilename("  style.css  ", [])).toEqual({ ok: true, name: "style.css" });
  });

  it("accepts a valid .js name", () => {
    expect(validateNewFilename("snake.js", ["index.html", "style.css"])).toEqual({
      ok: true,
      name: "snake.js",
    });
  });

  it("accepts uppercase extensions by lowercasing the check", () => {
    expect(validateNewFilename("PAGE.HTML", []).ok).toBe(true);
  });

  it("exposes the allowed extensions as a stable constant", () => {
    expect(ALLOWED_NEW_FILE_EXTENSIONS).toEqual(["html", "css", "js"]);
  });
});
