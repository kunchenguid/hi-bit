import { describe, expect, it } from "vitest";
import { isCreateProfileFormDirty, validateCreateProfileFields } from "./createProfileValidation";

describe("validateCreateProfileFields", () => {
  it("returns no errors for valid input", () => {
    expect(validateCreateProfileFields({ name: "Alex", age: "10" })).toEqual({});
  });

  it("flags an empty name", () => {
    expect(validateCreateProfileFields({ name: "", age: "10" })).toEqual({
      name: "We need a name to greet you by.",
    });
  });

  it("flags a whitespace-only name", () => {
    expect(validateCreateProfileFields({ name: "   ", age: "10" }).name).toBeTruthy();
  });

  it("flags a missing age", () => {
    expect(validateCreateProfileFields({ name: "Alex", age: "" }).age).toBeTruthy();
  });

  it("flags an age below the supported range", () => {
    expect(validateCreateProfileFields({ name: "Alex", age: "2" }).age).toBeTruthy();
  });

  it("flags an age above the supported range", () => {
    expect(validateCreateProfileFields({ name: "Alex", age: "19" }).age).toBeTruthy();
  });

  it("accepts the boundary ages 3 and 18", () => {
    expect(validateCreateProfileFields({ name: "Alex", age: "3" })).toEqual({});
    expect(validateCreateProfileFields({ name: "Alex", age: "18" })).toEqual({});
  });

  it("flags both name and age when both are invalid", () => {
    const errs = validateCreateProfileFields({ name: "", age: "" });
    expect(errs.name).toBeTruthy();
    expect(errs.age).toBeTruthy();
  });
});

describe("isCreateProfileFormDirty", () => {
  it("is false when every field is empty", () => {
    expect(isCreateProfileFormDirty({ name: "", age: "", interests: "", notes: "" })).toBe(false);
  });

  it("is true when name has any character", () => {
    expect(isCreateProfileFormDirty({ name: "E", age: "", interests: "", notes: "" })).toBe(true);
  });

  it("is true when age has any character", () => {
    expect(isCreateProfileFormDirty({ name: "", age: "8", interests: "", notes: "" })).toBe(true);
  });

  it("is true when interests has any character", () => {
    expect(isCreateProfileFormDirty({ name: "", age: "", interests: "chess", notes: "" })).toBe(
      true,
    );
  });

  it("is true when notes has any character", () => {
    expect(
      isCreateProfileFormDirty({ name: "", age: "", interests: "", notes: "loves space" }),
    ).toBe(true);
  });

  it("treats whitespace-only input as dirty so Start over can recover from accidental keystrokes", () => {
    expect(isCreateProfileFormDirty({ name: " ", age: "", interests: "", notes: "" })).toBe(true);
  });
});
