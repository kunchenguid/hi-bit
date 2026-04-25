export type KnowledgePointArea = "html" | "css" | "js" | "dom" | "canvas" | "interactivity";

export const KP_AREAS = [
  "html",
  "css",
  "js",
  "dom",
  "canvas",
  "interactivity",
] as const satisfies readonly KnowledgePointArea[];

export type MasterySignals = {
  saw_it: string;
  did_with_help: string;
  did_unprompted: string;
  explained_it: string;
};

export type KnowledgePoint = {
  id: string;
  title_parent: string;
  title_kid: string;
  why_kid?: string;
  area: KnowledgePointArea;
  prereqs: string[];
  introduces: string[];
  mastery_signals: MasterySignals;
};

export type KnowledgeGraph = {
  nodes: KnowledgePoint[];
  byId: Record<string, KnowledgePoint>;
};

export type KnowledgeGraphValidationError =
  | { kind: "duplicate-id"; id: string }
  | { kind: "unresolved-prereq"; id: string; prereq: string }
  | { kind: "cycle"; path: string[] };

export type KnowledgeGraphValidation =
  | { ok: true; graph: KnowledgeGraph }
  | { ok: false; errors: KnowledgeGraphValidationError[] };
