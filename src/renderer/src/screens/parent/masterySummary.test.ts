import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import { emptyProgress, type Progress } from "@shared/progress";
import { describe, expect, it } from "vitest";
import {
  categorizeKpForSummary,
  computeMasterySummary,
  type MasteryAreaSummary,
} from "./masterySummary";

function kp(id: string, area: KnowledgePoint["area"]): KnowledgePoint {
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

function graphOf(nodes: KnowledgePoint[]): KnowledgeGraph {
  const byId: Record<string, KnowledgePoint> = {};
  for (const node of nodes) byId[node.id] = node;
  return { nodes, byId };
}

function findArea(
  summary: ReturnType<typeof computeMasterySummary>,
  area: MasteryAreaSummary["area"],
): MasteryAreaSummary | undefined {
  return summary.areas.find((a) => a.area === area);
}

describe("categorizeKpForSummary", () => {
  it("returns notStarted for null progress", () => {
    expect(categorizeKpForSummary(null, "anything")).toBe("notStarted");
  });

  it("returns notStarted for missing KP entry", () => {
    expect(categorizeKpForSummary(emptyProgress(), "anything")).toBe("notStarted");
  });

  it("returns skipped when the skipped flag is set, regardless of status", () => {
    const progress: Progress = {
      ...emptyProgress(),
      knowledgePoints: {
        "css-colors": {
          status: "explained_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          skipped: true,
        },
      },
    };
    expect(categorizeKpForSummary(progress, "css-colors")).toBe("skipped");
  });

  it("returns inProgress for saw_it", () => {
    const progress: Progress = {
      ...emptyProgress(),
      knowledgePoints: {
        x: {
          status: "saw_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      },
    };
    expect(categorizeKpForSummary(progress, "x")).toBe("inProgress");
  });

  it("returns mastered for did_with_help and above", () => {
    const levels = ["did_with_help", "did_unprompted", "explained_it"] as const;
    for (const status of levels) {
      const progress: Progress = {
        ...emptyProgress(),
        knowledgePoints: {
          x: {
            status,
            firstSeenAt: "2026-04-23T00:00:00.000Z",
            updatedAt: "2026-04-23T00:00:00.000Z",
          },
        },
      };
      expect(categorizeKpForSummary(progress, "x")).toBe("mastered");
    }
  });
});

describe("computeMasterySummary", () => {
  it("returns an empty summary when graph is null", () => {
    const summary = computeMasterySummary(null, null);
    expect(summary.areas).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.mastered).toBe(0);
    expect(summary.inProgress).toBe(0);
    expect(summary.notStarted).toBe(0);
    expect(summary.skipped).toBe(0);
  });

  it("omits areas with zero KPs from the breakdown", () => {
    const graph = graphOf([kp("html-a", "html"), kp("html-b", "html")]);
    const summary = computeMasterySummary(graph, emptyProgress());
    expect(summary.areas).toHaveLength(1);
    expect(summary.areas[0]?.area).toBe("html");
  });

  it("counts notStarted for KPs without progress entries", () => {
    const graph = graphOf([kp("a", "html"), kp("b", "html")]);
    const summary = computeMasterySummary(graph, emptyProgress());
    const html = findArea(summary, "html");
    expect(html?.total).toBe(2);
    expect(html?.notStarted).toBe(2);
    expect(html?.inProgress).toBe(0);
    expect(html?.mastered).toBe(0);
    expect(html?.skipped).toBe(0);
  });

  it("buckets KPs across all four categories within one area", () => {
    const graph = graphOf([kp("a", "css"), kp("b", "css"), kp("c", "css"), kp("d", "css")]);
    const progress: Progress = {
      ...emptyProgress(),
      knowledgePoints: {
        a: {
          status: "saw_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        b: {
          status: "did_unprompted",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        c: {
          status: "saw_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          skipped: true,
        },
      },
    };
    const summary = computeMasterySummary(graph, progress);
    const css = findArea(summary, "css");
    expect(css?.total).toBe(4);
    expect(css?.inProgress).toBe(1);
    expect(css?.mastered).toBe(1);
    expect(css?.skipped).toBe(1);
    expect(css?.notStarted).toBe(1);
  });

  it("aggregates totals across multiple areas", () => {
    const graph = graphOf([
      kp("h1", "html"),
      kp("h2", "html"),
      kp("j1", "js"),
      kp("j2", "js"),
      kp("j3", "js"),
    ]);
    const progress: Progress = {
      ...emptyProgress(),
      knowledgePoints: {
        h1: {
          status: "explained_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
        j1: {
          status: "saw_it",
          firstSeenAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
        },
      },
    };
    const summary = computeMasterySummary(graph, progress);
    expect(summary.total).toBe(5);
    expect(summary.mastered).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.notStarted).toBe(3);
    expect(summary.skipped).toBe(0);
    const html = findArea(summary, "html");
    const js = findArea(summary, "js");
    expect(html?.total).toBe(2);
    expect(js?.total).toBe(3);
  });

  it("preserves KP_AREAS ordering across the returned areas array", () => {
    const graph = graphOf([kp("c1", "canvas"), kp("h1", "html"), kp("j1", "js")]);
    const summary = computeMasterySummary(graph, null);
    expect(summary.areas.map((a) => a.area)).toEqual(["html", "js", "canvas"]);
  });
});
