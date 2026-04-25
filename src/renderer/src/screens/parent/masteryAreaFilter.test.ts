import type { KnowledgePoint, KnowledgePointArea } from "@shared/knowledgeGraph";
import { describe, expect, it } from "vitest";
import {
  countKpsByAreaFilter,
  filterKpsByArea,
  MASTERY_AREA_FILTER_LABELS,
  MASTERY_AREA_FILTERS,
} from "./masteryAreaFilter";

function kp(id: string, area: KnowledgePointArea): KnowledgePoint {
  return {
    id,
    title_parent: id,
    title_kid: id,
    area,
    prereqs: [],
    introduces: [],
    mastery_signals: {
      saw_it: "",
      did_with_help: "",
      did_unprompted: "",
      explained_it: "",
    },
  };
}

describe("MASTERY_AREA_FILTERS", () => {
  it("exposes all seven filter ids in order (all + 6 areas)", () => {
    expect(MASTERY_AREA_FILTERS).toEqual([
      "all",
      "html",
      "css",
      "js",
      "dom",
      "canvas",
      "interactivity",
    ]);
  });
});

describe("MASTERY_AREA_FILTER_LABELS", () => {
  it("provides a human-friendly label for every filter id", () => {
    expect(MASTERY_AREA_FILTER_LABELS).toEqual({
      all: "all",
      html: "HTML",
      css: "CSS",
      js: "JavaScript",
      dom: "DOM",
      canvas: "Canvas",
      interactivity: "Interactivity",
    });
  });
});

describe("filterKpsByArea", () => {
  const nodes = [
    kp("a", "html"),
    kp("b", "css"),
    kp("c", "js"),
    kp("d", "dom"),
    kp("e", "canvas"),
    kp("f", "interactivity"),
    kp("g", "html"),
  ];

  it("returns a new array on 'all' pass-through (not the same reference)", () => {
    const result = filterKpsByArea(nodes, "all");
    expect(result).toEqual(nodes);
    expect(result).not.toBe(nodes);
  });

  it("preserves input order on 'all'", () => {
    expect(filterKpsByArea(nodes, "all").map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
  });

  it("filters to html only", () => {
    expect(filterKpsByArea(nodes, "html").map((n) => n.id)).toEqual(["a", "g"]);
  });

  it("filters to css only", () => {
    expect(filterKpsByArea(nodes, "css").map((n) => n.id)).toEqual(["b"]);
  });

  it("filters to js only", () => {
    expect(filterKpsByArea(nodes, "js").map((n) => n.id)).toEqual(["c"]);
  });

  it("filters to dom only", () => {
    expect(filterKpsByArea(nodes, "dom").map((n) => n.id)).toEqual(["d"]);
  });

  it("filters to canvas only", () => {
    expect(filterKpsByArea(nodes, "canvas").map((n) => n.id)).toEqual(["e"]);
  });

  it("filters to interactivity only", () => {
    expect(filterKpsByArea(nodes, "interactivity").map((n) => n.id)).toEqual(["f"]);
  });

  it("returns an empty array for an empty input at every filter", () => {
    expect(filterKpsByArea([], "all")).toEqual([]);
    expect(filterKpsByArea([], "html")).toEqual([]);
    expect(filterKpsByArea([], "css")).toEqual([]);
    expect(filterKpsByArea([], "js")).toEqual([]);
    expect(filterKpsByArea([], "dom")).toEqual([]);
    expect(filterKpsByArea([], "canvas")).toEqual([]);
    expect(filterKpsByArea([], "interactivity")).toEqual([]);
  });

  it("does not mutate the input nodes array", () => {
    const input = [kp("a", "html"), kp("b", "css")];
    const before = input.slice();
    filterKpsByArea(input, "all");
    filterKpsByArea(input, "html");
    expect(input).toEqual(before);
  });
});

describe("countKpsByAreaFilter", () => {
  it("returns zeros for an empty list", () => {
    expect(countKpsByAreaFilter([])).toEqual({
      all: 0,
      html: 0,
      css: 0,
      js: 0,
      dom: 0,
      canvas: 0,
      interactivity: 0,
    });
  });

  it("maps 'all' to nodes.length and counts each area", () => {
    const nodes = [
      kp("a", "html"),
      kp("b", "html"),
      kp("c", "css"),
      kp("d", "js"),
      kp("e", "dom"),
      kp("f", "canvas"),
      kp("g", "interactivity"),
      kp("h", "interactivity"),
    ];
    expect(countKpsByAreaFilter(nodes)).toEqual({
      all: 8,
      html: 2,
      css: 1,
      js: 1,
      dom: 1,
      canvas: 1,
      interactivity: 2,
    });
  });

  it("does not mutate the input nodes array", () => {
    const nodes = [kp("a", "html"), kp("b", "css")];
    const before = nodes.slice();
    countKpsByAreaFilter(nodes);
    expect(nodes).toEqual(before);
  });
});
