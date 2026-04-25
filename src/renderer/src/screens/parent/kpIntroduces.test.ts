import type { KnowledgePoint } from "@shared/knowledgeGraph";
import { describe, expect, it } from "vitest";
import { describeKpIntroduces } from "./kpIntroduces";

function makeKp(overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id: overrides.id ?? "html-doc-shell",
    title_parent: overrides.title_parent ?? "Doc Shell",
    title_kid: overrides.title_kid ?? "the skeleton",
    area: overrides.area ?? "html",
    prereqs: overrides.prereqs ?? [],
    introduces: overrides.introduces ?? [],
    mastery_signals: overrides.mastery_signals ?? {
      saw_it: "saw",
      did_with_help: "helped",
      did_unprompted: "solo",
      explained_it: "explained",
    },
  };
}

describe("describeKpIntroduces", () => {
  it("returns null when kp is null", () => {
    expect(describeKpIntroduces(null)).toBeNull();
  });

  it("returns null when kp is undefined", () => {
    expect(describeKpIntroduces(undefined)).toBeNull();
  });

  it("returns null when introduces is empty", () => {
    expect(describeKpIntroduces(makeKp({ introduces: [] }))).toBeNull();
  });

  it("returns null when introduces contains only empty strings", () => {
    expect(describeKpIntroduces(makeKp({ introduces: ["", "   "] }))).toBeNull();
  });

  it("returns tags in author order for a typical case", () => {
    const kp = makeKp({ introduces: ["event-handler", "callback-function", "dom-event"] });
    expect(describeKpIntroduces(kp)).toEqual(["event-handler", "callback-function", "dom-event"]);
  });

  it("trims surrounding whitespace from each tag", () => {
    const kp = makeKp({ introduces: ["  doctype  ", "\thtml-head-body\n"] });
    expect(describeKpIntroduces(kp)).toEqual(["doctype", "html-head-body"]);
  });

  it("deduplicates repeated tags, preserving first-seen order", () => {
    const kp = makeKp({ introduces: ["loop", "loop-variable", "loop", "iteration"] });
    expect(describeKpIntroduces(kp)).toEqual(["loop", "loop-variable", "iteration"]);
  });

  it("skips non-string entries in the array", () => {
    const kp = makeKp({
      introduces: ["valid", 42 as unknown as string, null as unknown as string, "also-valid"],
    });
    expect(describeKpIntroduces(kp)).toEqual(["valid", "also-valid"]);
  });

  it("returns null when introduces is not an array", () => {
    const kp = makeKp();
    (kp as unknown as { introduces: unknown }).introduces = "not-an-array";
    expect(describeKpIntroduces(kp)).toBeNull();
  });

  it("does not mutate the input KP's introduces array", () => {
    const tags = ["a", "", "a", "b"];
    const kp = makeKp({ introduces: tags });
    describeKpIntroduces(kp);
    expect(tags).toEqual(["a", "", "a", "b"]);
  });
});
