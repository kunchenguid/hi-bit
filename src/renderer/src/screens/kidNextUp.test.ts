import type { KnowledgePoint } from "@shared/knowledgeGraph";
import { describe, expect, it } from "vitest";
import { describeKidNextUp } from "./kidNextUp";
import type { NextKpSuggestion } from "./parent/nextKpSuggestion";

function makeKp(id: string, titleKid: string, whyKid?: string): KnowledgePoint {
  return {
    id,
    title_parent: `${id} parent`,
    title_kid: titleKid,
    ...(whyKid !== undefined ? { why_kid: whyKid } : {}),
    area: "html",
    prereqs: [],
    introduces: [],
    mastery_signals: { saw_it: "s", did_with_help: "d", did_unprompted: "u", explained_it: "e" },
  };
}

describe("describeKidNextUp", () => {
  it("returns null when suggestion is null", () => {
    expect(describeKidNextUp(null)).toBeNull();
  });

  it("returns null for no-dream (dream picker handles that surface)", () => {
    const suggestion: NextKpSuggestion = { kind: "no-dream" };
    expect(describeKidNextUp(suggestion)).toBeNull();
  });

  it("returns null while graph/library is still loading", () => {
    const suggestion: NextKpSuggestion = { kind: "loading" };
    expect(describeKidNextUp(suggestion)).toBeNull();
  });

  it("returns null for unknown-dream (silent for kid)", () => {
    const suggestion: NextKpSuggestion = { kind: "unknown-dream", dreamId: "missing-dream" };
    expect(describeKidNextUp(suggestion)).toBeNull();
  });

  it("returns null for unresolved-prereqs (hide graph issues from kid)", () => {
    const suggestion: NextKpSuggestion = { kind: "unresolved-prereqs", missing: ["x"] };
    expect(describeKidNextUp(suggestion)).toBeNull();
  });

  it("returns cheerful all-done text when every KP meets threshold", () => {
    const suggestion: NextKpSuggestion = { kind: "all-done" };
    expect(describeKidNextUp(suggestion)).toEqual({
      label: "All skills learned",
      text: "ready to build!",
    });
  });

  it("uses kid-friendly title for next-kp", () => {
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp("html-buttons", "make a button you can click"),
      status: null,
    };
    expect(describeKidNextUp(suggestion)).toEqual({
      label: "Up next",
      text: "make a button you can click",
    });
  });

  it("labels an already-started KP as keep practicing", () => {
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp("html-doc-shell", "the frame that holds your page"),
      status: "saw_it",
    };
    expect(describeKidNextUp(suggestion)).toEqual({
      label: "Keep practicing",
      text: "the frame that holds your page",
    });
  });

  it("preserves the exact kid title verbatim (no truncation)", () => {
    const longTitle = "a very long kid-friendly title that happens to exceed typical pill width";
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp("html-long", longTitle),
      status: null,
    };
    expect(describeKidNextUp(suggestion)?.text).toBe(longTitle);
  });

  it("includes why_kid as subtext when present on the KP", () => {
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp(
        "html-doc-shell",
        "the frame that holds your page",
        "every page needs this outer wrapper before anything else shows up.",
      ),
      status: null,
    };
    expect(describeKidNextUp(suggestion)).toEqual({
      label: "Up next",
      text: "the frame that holds your page",
      subtext: "every page needs this outer wrapper before anything else shows up.",
    });
  });

  it("omits subtext when why_kid is absent", () => {
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp("html-buttons", "make a button you can click"),
      status: null,
    };
    const out = describeKidNextUp(suggestion);
    expect(out?.subtext).toBeUndefined();
  });

  it("omits subtext when why_kid is blank whitespace", () => {
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp("html-buttons", "make a button you can click", "   "),
      status: null,
    };
    const out = describeKidNextUp(suggestion);
    expect(out?.subtext).toBeUndefined();
  });

  it("all-done state has no subtext", () => {
    const suggestion: NextKpSuggestion = { kind: "all-done" };
    const out = describeKidNextUp(suggestion);
    expect(out?.subtext).toBeUndefined();
  });

  it("uses sentence-case 'Up next' label, not ALL CAPS", () => {
    const suggestion: NextKpSuggestion = {
      kind: "next-kp",
      kp: makeKp("html-doc-shell", "the frame that holds your page"),
      status: null,
    };
    const out = describeKidNextUp(suggestion);
    expect(out?.label).toBe("Up next");
    expect(out?.label).not.toMatch(/UP NEXT/);
  });
});
