import { describe, expect, it } from "vitest";
import { computeNextTabIndex } from "./tablistNavigation";

describe("computeNextTabIndex", () => {
  it("ArrowRight moves to the next tab", () => {
    expect(computeNextTabIndex(0, 3, "ArrowRight")).toBe(1);
  });

  it("ArrowRight wraps from last tab to first", () => {
    expect(computeNextTabIndex(2, 3, "ArrowRight")).toBe(0);
  });

  it("ArrowLeft moves to the previous tab", () => {
    expect(computeNextTabIndex(2, 3, "ArrowLeft")).toBe(1);
  });

  it("ArrowLeft wraps from first tab to last", () => {
    expect(computeNextTabIndex(0, 3, "ArrowLeft")).toBe(2);
  });

  it("Home moves to the first tab", () => {
    expect(computeNextTabIndex(2, 3, "Home")).toBe(0);
  });

  it("Home returns null when already on the first tab", () => {
    expect(computeNextTabIndex(0, 3, "Home")).toBeNull();
  });

  it("End moves to the last tab", () => {
    expect(computeNextTabIndex(0, 3, "End")).toBe(2);
  });

  it("End returns null when already on the last tab", () => {
    expect(computeNextTabIndex(2, 3, "End")).toBeNull();
  });

  it("returns null for unrelated keys like Enter, Tab, Space", () => {
    expect(computeNextTabIndex(0, 3, "Enter")).toBeNull();
    expect(computeNextTabIndex(0, 3, "Tab")).toBeNull();
    expect(computeNextTabIndex(0, 3, " ")).toBeNull();
  });

  it("returns null when there is only one tab", () => {
    expect(computeNextTabIndex(0, 1, "ArrowRight")).toBeNull();
    expect(computeNextTabIndex(0, 1, "Home")).toBeNull();
  });

  it("returns null when there are no tabs", () => {
    expect(computeNextTabIndex(0, 0, "ArrowRight")).toBeNull();
  });

  it("returns null when the current index is out of range", () => {
    expect(computeNextTabIndex(-1, 3, "ArrowRight")).toBeNull();
    expect(computeNextTabIndex(5, 3, "ArrowRight")).toBeNull();
  });
});
