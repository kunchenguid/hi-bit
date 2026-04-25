import { describe, expect, it } from "vitest";
import { applyTheme, type ThemeTarget } from "./applyTheme";

function makeTarget(initial: string | null = null): ThemeTarget & { current: string | null } {
  let current = initial;
  return {
    get current() {
      return current;
    },
    getAttribute: (name: string) => (name === "data-theme" ? current : null),
    setAttribute: (name: string, value: string) => {
      if (name === "data-theme") current = value;
    },
    removeAttribute: (name: string) => {
      if (name === "data-theme") current = null;
    },
  };
}

describe("applyTheme", () => {
  it("sets data-theme='light' when theme is 'light'", () => {
    const target = makeTarget();
    applyTheme(target, "light");
    expect(target.current).toBe("light");
  });

  it("sets data-theme='dark' when theme is 'dark'", () => {
    const target = makeTarget();
    applyTheme(target, "dark");
    expect(target.current).toBe("dark");
  });

  it("removes data-theme when theme is undefined (follow system)", () => {
    const target = makeTarget("dark");
    applyTheme(target, undefined);
    expect(target.current).toBeNull();
  });

  it("leaves data-theme untouched when already at the desired value", () => {
    const target = makeTarget("light");
    let sets = 0;
    const wrapped: ThemeTarget = {
      getAttribute: target.getAttribute,
      setAttribute: (name, value) => {
        sets += 1;
        target.setAttribute(name, value);
      },
      removeAttribute: target.removeAttribute,
    };
    applyTheme(wrapped, "light");
    expect(sets).toBe(0);
    expect(target.current).toBe("light");
  });

  it("leaves data-theme absent when already absent and theme is undefined", () => {
    const target = makeTarget(null);
    let removes = 0;
    const wrapped: ThemeTarget = {
      getAttribute: target.getAttribute,
      setAttribute: target.setAttribute,
      removeAttribute: (name) => {
        removes += 1;
        target.removeAttribute(name);
      },
    };
    applyTheme(wrapped, undefined);
    expect(removes).toBe(0);
    expect(target.current).toBeNull();
  });

  it("overwrites an existing data-theme with a different value", () => {
    const target = makeTarget("light");
    applyTheme(target, "dark");
    expect(target.current).toBe("dark");
  });
});
