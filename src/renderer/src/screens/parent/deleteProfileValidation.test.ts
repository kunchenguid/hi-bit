import { describe, expect, it } from "vitest";
import { validateDeleteProfileConfirmation } from "./deleteProfileValidation";

describe("validateDeleteProfileConfirmation", () => {
  it("rejects an empty typed name", () => {
    const result = validateDeleteProfileConfirmation("Ada", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/type the profile name/i);
    }
  });

  it("rejects a whitespace-only typed name", () => {
    const result = validateDeleteProfileConfirmation("Ada", "   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/type the profile name/i);
    }
  });

  it("rejects a mismatched typed name", () => {
    const result = validateDeleteProfileConfirmation("Ada", "Bea");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/doesn.?t match/i);
    }
  });

  it("rejects a case-different typed name", () => {
    const result = validateDeleteProfileConfirmation("Ada", "ada");
    expect(result.ok).toBe(false);
  });

  it("accepts an exact match", () => {
    expect(validateDeleteProfileConfirmation("Ada", "Ada")).toEqual({ ok: true });
  });

  it("accepts a match with surrounding whitespace on the typed name", () => {
    expect(validateDeleteProfileConfirmation("Ada", "  Ada  ")).toEqual({ ok: true });
  });

  it("rejects an empty profile name input as a safety guard", () => {
    const result = validateDeleteProfileConfirmation("", "");
    expect(result.ok).toBe(false);
  });
});
