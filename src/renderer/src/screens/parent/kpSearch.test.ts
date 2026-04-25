import type { KnowledgePoint, KnowledgePointArea } from "@shared/knowledgeGraph";
import { describe, expect, it } from "vitest";
import { normalizeKpSearchQuery, searchKpsByText } from "./kpSearch";

function makeKp(id: string, overrides: Partial<KnowledgePoint> = {}): KnowledgePoint {
  return {
    id,
    title_parent: overrides.title_parent ?? id,
    title_kid: overrides.title_kid ?? id,
    area: overrides.area ?? ("html" as KnowledgePointArea),
    prereqs: overrides.prereqs ?? [],
    introduces: overrides.introduces ?? [],
    mastery_signals: overrides.mastery_signals ?? {
      saw_it: "saw",
      did_with_help: "did with help",
      did_unprompted: "did unprompted",
      explained_it: "explained",
    },
  };
}

describe("normalizeKpSearchQuery", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeKpSearchQuery("  DOM  Events  ")).toBe("dom events");
  });

  it("returns empty string when query is blank", () => {
    expect(normalizeKpSearchQuery("")).toBe("");
    expect(normalizeKpSearchQuery("   ")).toBe("");
    expect(normalizeKpSearchQuery("\t\n")).toBe("");
  });
});

describe("searchKpsByText", () => {
  it("returns all KPs unchanged when query is blank", () => {
    const nodes = [makeKp("a"), makeKp("b")];
    expect(searchKpsByText(nodes, "")).toEqual(nodes);
    expect(searchKpsByText(nodes, "   ")).toEqual(nodes);
  });

  it("preserves input order when query is blank", () => {
    const nodes = [makeKp("z"), makeKp("a")];
    expect(searchKpsByText(nodes, "").map((n) => n.id)).toEqual(["z", "a"]);
  });

  it("matches the parent-facing title case-insensitively", () => {
    const nodes = [
      makeKp("dom-events-click", { title_parent: "DOM click events" }),
      makeKp("html-buttons", { title_parent: "HTML buttons" }),
    ];
    expect(searchKpsByText(nodes, "click").map((n) => n.id)).toEqual(["dom-events-click"]);
    expect(searchKpsByText(nodes, "CLICK").map((n) => n.id)).toEqual(["dom-events-click"]);
  });

  it("matches the kid-facing title", () => {
    const nodes = [
      makeKp("a", { title_parent: "Event listeners", title_kid: "making buttons do stuff" }),
      makeKp("b", { title_parent: "Canvas drawing", title_kid: "drawing with code" }),
    ];
    expect(searchKpsByText(nodes, "buttons").map((n) => n.id)).toEqual(["a"]);
  });

  it("matches the id", () => {
    const nodes = [
      makeKp("html-doc-shell", { title_parent: "Doc shell" }),
      makeKp("html-text-paragraphs", { title_parent: "Paragraphs" }),
    ];
    expect(searchKpsByText(nodes, "shell").map((n) => n.id)).toEqual(["html-doc-shell"]);
  });

  it("matches the area", () => {
    const nodes = [makeKp("a", { area: "html" }), makeKp("b", { area: "canvas" })];
    expect(searchKpsByText(nodes, "canvas").map((n) => n.id)).toEqual(["b"]);
  });

  it("matches introduces tags", () => {
    const nodes = [
      makeKp("a", { introduces: ["selector", "styling"] }),
      makeKp("b", { introduces: ["listener"] }),
    ];
    expect(searchKpsByText(nodes, "selector").map((n) => n.id)).toEqual(["a"]);
    expect(searchKpsByText(nodes, "listener").map((n) => n.id)).toEqual(["b"]);
  });

  it("treats multi-word queries as AND across tokens", () => {
    const nodes = [
      makeKp("a", { title_parent: "DOM click", area: "dom", introduces: ["listener"] }),
      makeKp("b", { title_parent: "DOM ready", area: "dom", introduces: ["lifecycle"] }),
      makeKp("c", { title_parent: "Canvas draw", area: "canvas", introduces: ["listener"] }),
    ];
    expect(searchKpsByText(nodes, "dom listener").map((n) => n.id)).toEqual(["a"]);
  });

  it("returns an empty list when nothing matches", () => {
    const nodes = [makeKp("a", { title_parent: "cats" })];
    expect(searchKpsByText(nodes, "rocket")).toEqual([]);
  });

  it("returns an empty list for an empty input regardless of query", () => {
    expect(searchKpsByText([], "")).toEqual([]);
    expect(searchKpsByText([], "click")).toEqual([]);
  });

  it("preserves input order across matches", () => {
    const nodes = [
      makeKp("z", { title_parent: "event z" }),
      makeKp("a", { title_parent: "event a" }),
    ];
    expect(searchKpsByText(nodes, "event").map((n) => n.id)).toEqual(["z", "a"]);
  });

  it("ignores extra internal whitespace in the query", () => {
    const nodes = [makeKp("a", { title_parent: "DOM click events" })];
    expect(searchKpsByText(nodes, "  dom   click  ").map((n) => n.id)).toEqual(["a"]);
  });
});
