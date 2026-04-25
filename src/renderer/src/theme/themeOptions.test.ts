import { describe, expect, it } from "vitest";
import { buildThemeOptions } from "./themeOptions";

describe("buildThemeOptions", () => {
  it("returns the three options in system/light/dark order", () => {
    const options = buildThemeOptions(undefined);
    expect(options.map((o) => o.id)).toEqual(["system", "light", "dark"]);
  });

  it("exposes stable labels for each option", () => {
    const options = buildThemeOptions(undefined);
    expect(options.map((o) => o.label)).toEqual(["System", "Light", "Dark"]);
  });

  it("maps each option to its persistence value (null = follow system)", () => {
    const options = buildThemeOptions(undefined);
    expect(options.map((o) => o.theme)).toEqual([null, "light", "dark"]);
  });

  it("marks System as pressed when current is undefined", () => {
    const options = buildThemeOptions(undefined);
    expect(options.find((o) => o.id === "system")?.pressed).toBe(true);
    expect(options.find((o) => o.id === "light")?.pressed).toBe(false);
    expect(options.find((o) => o.id === "dark")?.pressed).toBe(false);
  });

  it("marks Light as pressed when current is 'light'", () => {
    const options = buildThemeOptions("light");
    expect(options.find((o) => o.id === "light")?.pressed).toBe(true);
    expect(options.find((o) => o.id === "system")?.pressed).toBe(false);
    expect(options.find((o) => o.id === "dark")?.pressed).toBe(false);
  });

  it("marks Dark as pressed when current is 'dark'", () => {
    const options = buildThemeOptions("dark");
    expect(options.find((o) => o.id === "dark")?.pressed).toBe(true);
    expect(options.find((o) => o.id === "system")?.pressed).toBe(false);
    expect(options.find((o) => o.id === "light")?.pressed).toBe(false);
  });

  it("returns exactly one pressed option for every input", () => {
    for (const current of [undefined, "light", "dark"] as const) {
      const options = buildThemeOptions(current);
      expect(options.filter((o) => o.pressed).length).toBe(1);
    }
  });
});
