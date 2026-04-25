import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type KnowledgeGraphValidation,
  type KnowledgeGraphValidationError,
  type KnowledgePoint,
  type KnowledgePointArea,
  KP_AREAS,
  type MasterySignals,
} from "@shared/knowledgeGraph";
import { load as parseYaml } from "js-yaml";

const MASTERY_KEYS: readonly (keyof MasterySignals)[] = [
  "saw_it",
  "did_with_help",
  "did_unprompted",
  "explained_it",
];

function isArea(value: unknown): value is KnowledgePointArea {
  return typeof value === "string" && (KP_AREAS as readonly string[]).includes(value);
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings`);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(`${field} must contain only strings`);
    }
  }
  return value as string[];
}

function asMasterySignals(value: unknown): MasterySignals {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("mastery_signals must be an object");
  }
  const obj = value as Record<string, unknown>;
  for (const key of MASTERY_KEYS) {
    if (typeof obj[key] !== "string" || obj[key] === "") {
      throw new Error(`mastery_signals.${key} must be a non-empty string`);
    }
  }
  return {
    saw_it: obj.saw_it as string,
    did_with_help: obj.did_with_help as string,
    did_unprompted: obj.did_unprompted as string,
    explained_it: obj.explained_it as string,
  };
}

export function parseKnowledgePoint(yaml: string): KnowledgePoint {
  const raw = parseYaml(yaml);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("KP node must be a YAML object at the top level");
  }
  const obj = raw as Record<string, unknown>;

  for (const field of ["id", "title_parent", "title_kid"] as const) {
    if (typeof obj[field] !== "string" || obj[field] === "") {
      throw new Error(`${field} must be a non-empty string`);
    }
  }
  if (!isArea(obj.area)) {
    throw new Error(`area must be one of ${KP_AREAS.join(", ")}`);
  }

  let whyKid: string | undefined;
  if (obj.why_kid !== undefined && obj.why_kid !== null) {
    if (typeof obj.why_kid !== "string" || obj.why_kid.trim() === "") {
      throw new Error("why_kid must be a non-empty string when present");
    }
    whyKid = obj.why_kid;
  }

  return {
    id: obj.id as string,
    title_parent: obj.title_parent as string,
    title_kid: obj.title_kid as string,
    ...(whyKid !== undefined ? { why_kid: whyKid } : {}),
    area: obj.area,
    prereqs: asStringArray(obj.prereqs, "prereqs"),
    introduces: asStringArray(obj.introduces, "introduces"),
    mastery_signals: asMasterySignals(obj.mastery_signals),
  };
}

function findCycle(nodes: KnowledgePoint[]): string[] | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  const stack: string[] = [];

  function visit(id: string): string[] | null {
    const c = color.get(id) ?? WHITE;
    if (c === GRAY) {
      const start = stack.indexOf(id);
      return stack.slice(start === -1 ? 0 : start).concat(id);
    }
    if (c === BLACK) return null;
    color.set(id, GRAY);
    stack.push(id);
    const node = byId.get(id);
    if (node) {
      for (const prereq of node.prereqs) {
        if (!byId.has(prereq)) continue;
        const found = visit(prereq);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const n of nodes) {
    const found = visit(n.id);
    if (found) return found;
  }
  return null;
}

export function validateGraph(nodes: KnowledgePoint[]): KnowledgeGraphValidation {
  const errors: KnowledgeGraphValidationError[] = [];
  const byId: Record<string, KnowledgePoint> = {};
  const seen = new Set<string>();

  for (const node of nodes) {
    if (seen.has(node.id)) {
      errors.push({ kind: "duplicate-id", id: node.id });
      continue;
    }
    seen.add(node.id);
    byId[node.id] = node;
  }

  for (const node of nodes) {
    for (const prereq of node.prereqs) {
      if (!seen.has(prereq)) {
        errors.push({ kind: "unresolved-prereq", id: node.id, prereq });
      }
    }
  }

  const cycle = findCycle(nodes);
  if (cycle) {
    errors.push({ kind: "cycle", path: cycle });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, graph: { nodes, byId } };
}

export async function loadKnowledgeGraph(dir: string): Promise<KnowledgeGraphValidation> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, graph: { nodes: [], byId: {} } };
    }
    throw err;
  }

  const ymlFiles = entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
  const nodes: KnowledgePoint[] = [];
  for (const file of ymlFiles) {
    const path = join(dir, file);
    const text = await readFile(path, "utf8");
    try {
      nodes.push(parseKnowledgePoint(text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${file}: ${msg}`);
    }
  }
  return validateGraph(nodes);
}
