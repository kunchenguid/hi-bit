import { describe, expect, test } from "vitest";
import { PARENT_DIRECTIVE_PRESETS, resolveDirectivePreset } from "./parentDirectivePresets";

describe("PARENT_DIRECTIVE_PRESETS", () => {
  test("exposes four presets with unique ids", () => {
    expect(PARENT_DIRECTIVE_PRESETS.length).toBe(4);
    const ids = PARENT_DIRECTIVE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every preset has a non-empty label and a build function", () => {
    for (const preset of PARENT_DIRECTIVE_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(typeof preset.build).toBe("function");
      expect(preset.build("Ada").trim().length).toBeGreaterThan(0);
    }
  });

  test("covers the PRD example directives", () => {
    const ids = PARENT_DIRECTIVE_PRESETS.map((p) => p.id);
    expect(ids).toContain("summarize-last-three");
    expect(ids).toContain("what-was-hard");
    expect(ids).toContain("focus-this-week");
    expect(ids).toContain("skip-known");
  });
});

describe("resolveDirectivePreset", () => {
  test("returns null for unknown preset id", () => {
    expect(resolveDirectivePreset("not-a-preset", "Ada")).toBeNull();
  });

  test("interpolates the kid name into the directive text", () => {
    const result = resolveDirectivePreset("summarize-last-three", "Ada");
    expect(result).toBe("Summarize Ada's last three sessions.");
  });

  test("builds the 'what was hard' directive with the kid name", () => {
    const result = resolveDirectivePreset("what-was-hard", "Rami");
    expect(result).toBe("What did Rami find hard today?");
  });

  test("builds the skip-known directive with the kid name", () => {
    const result = resolveDirectivePreset("skip-known", "Noor");
    expect(result).toBe("Noor already knows CSS colors from school, skip those.");
  });

  test("uses a fallback when kidName is blank", () => {
    const result = resolveDirectivePreset("what-was-hard", "   ");
    expect(result).toBe("What did the kid find hard today?");
  });

  test("trims whitespace around the kid name", () => {
    const result = resolveDirectivePreset("summarize-last-three", "  Ada  ");
    expect(result).toBe("Summarize Ada's last three sessions.");
  });

  test("focus-this-week does not include the kid name", () => {
    const result = resolveDirectivePreset("focus-this-week", "Ada");
    expect(result).toBe("This week focus on functions.");
  });
});
