import type { Dream, DreamValidation } from "@shared/dreams";
import { describe, expect, it } from "vitest";
import { requireRestartDream } from "./restartDream";

function makeDream(id: string): Dream {
  return {
    id,
    title_parent: id,
    title_kid: id,
    summary_kid: id,
    categories: ["creative"],
    interest_tags: [],
    requires: [],
    style_hints: [],
    emoji: "*",
    difficulty: 1,
  };
}

describe("requireRestartDream", () => {
  it("returns the requested dream from a valid library", () => {
    const dream = makeDream("hello-card");

    expect(
      requireRestartDream(
        { ok: true, library: { dreams: [dream], byId: { [dream.id]: dream } } },
        dream.id,
      ),
    ).toBe(dream);
  });

  it("throws before restart mutation when dream validation fails", () => {
    const result: DreamValidation = { ok: false, errors: [{ kind: "empty-requires", id: "bad" }] };

    expect(() => requireRestartDream(result, "bad")).toThrow("Dream library is invalid");
  });

  it("throws before restart mutation when the dream is missing", () => {
    expect(() =>
      requireRestartDream({ ok: true, library: { dreams: [], byId: {} } }, "missing"),
    ).toThrow("Unknown dream: missing");
  });
});
