import { describe, expect, it } from "vitest";
import {
  MIN_PIN_LENGTH,
  validatePinChange,
  validatePinEntry,
  validatePinSetup,
} from "./pinValidation";

describe("validatePinSetup", () => {
  it("rejects a PIN shorter than the minimum length", () => {
    const result = validatePinSetup("12", "12");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(`${MIN_PIN_LENGTH}`);
    }
  });

  it("rejects mismatched pin and confirm", () => {
    const result = validatePinSetup("1234", "1235");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/match/i);
    }
  });

  it("accepts matching pins at the minimum length", () => {
    expect(validatePinSetup("1234", "1234")).toEqual({ ok: true });
  });

  it("accepts matching longer pins and alphanumeric characters", () => {
    expect(validatePinSetup("abc1234!", "abc1234!")).toEqual({ ok: true });
  });

  it("treats an empty confirm as a mismatch, not a length failure", () => {
    const result = validatePinSetup("1234", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/match/i);
    }
  });
});

describe("validatePinEntry", () => {
  it("rejects an empty pin", () => {
    const result = validatePinEntry("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/pin/i);
    }
  });

  it("accepts any non-empty pin (verification is server-side)", () => {
    expect(validatePinEntry("a")).toEqual({ ok: true });
    expect(validatePinEntry("9876")).toEqual({ ok: true });
  });
});

describe("validatePinChange", () => {
  it("rejects an empty current pin", () => {
    const result = validatePinChange("", "5678", "5678");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/current/i);
    }
  });

  it("rejects a new pin shorter than the minimum length", () => {
    const result = validatePinChange("1234", "12", "12");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(`${MIN_PIN_LENGTH}`);
    }
  });

  it("rejects a new pin that matches the current pin", () => {
    const result = validatePinChange("1234", "1234", "1234");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/different/i);
    }
  });

  it("rejects mismatched new pin and confirm", () => {
    const result = validatePinChange("1234", "5678", "5679");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/match/i);
    }
  });

  it("accepts a valid change with matching new and confirm", () => {
    expect(validatePinChange("1234", "5678", "5678")).toEqual({ ok: true });
  });

  it("accepts an alphanumeric new pin distinct from the current pin", () => {
    expect(validatePinChange("1234", "abcd!9", "abcd!9")).toEqual({ ok: true });
  });
});
