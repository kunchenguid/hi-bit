import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DREAM_CATEGORIES,
  type Dream,
  type DreamCategory,
  type DreamDefinition,
  type DreamDifficulty,
  type DreamValidation,
  type DreamValidationError,
} from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import { load as parseYaml } from "js-yaml";

function isCategory(value: unknown): value is DreamCategory {
  return typeof value === "string" && (DREAM_CATEGORIES as readonly string[]).includes(value);
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

function asCategoryArray(value: unknown): DreamCategory[] {
  if (!Array.isArray(value)) {
    throw new Error(`categories must be an array of ${DREAM_CATEGORIES.join(", ")}`);
  }
  const out: DreamCategory[] = [];
  for (const entry of value) {
    if (!isCategory(entry)) {
      throw new Error(`categories entries must be one of ${DREAM_CATEGORIES.join(", ")}`);
    }
    out.push(entry);
  }
  return out;
}

export function parseDream(yaml: string): DreamDefinition {
  const raw = parseYaml(yaml);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Dream file must be a YAML object at the top level");
  }
  const obj = raw as Record<string, unknown>;

  for (const field of ["id", "title_parent", "title_kid", "summary_kid", "emoji"] as const) {
    if (typeof obj[field] !== "string" || obj[field] === "") {
      throw new Error(`${field} must be a non-empty string`);
    }
  }

  const categories = asCategoryArray(obj.categories);

  return {
    id: obj.id as string,
    title_parent: obj.title_parent as string,
    title_kid: obj.title_kid as string,
    summary_kid: obj.summary_kid as string,
    categories,
    interest_tags: asStringArray(obj.interest_tags, "interest_tags"),
    requires: asStringArray(obj.requires, "requires"),
    style_hints: asStringArray(obj.style_hints, "style_hints"),
    emoji: obj.emoji as string,
  };
}

function scoreKpDepth(depth: number): DreamDifficulty {
  if (depth <= 1) return 1;
  if (depth <= 3) return 2;
  if (depth <= 5) return 3;
  if (depth <= 7) return 4;
  return 5;
}

function scoreKpCount(count: number): DreamDifficulty {
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  if (count <= 10) return 4;
  return 5;
}

export function computeDreamDifficulty(
  dream: DreamDefinition,
  graph: KnowledgeGraph,
): DreamDifficulty {
  const depthMemo = new Map<string, number>();
  const depthStack = new Set<string>();
  const closure = new Set<string>();

  function kpDepth(id: string): number {
    const memoized = depthMemo.get(id);
    if (memoized !== undefined) return memoized;
    if (depthStack.has(id)) return 1;
    const node = graph.byId[id];
    if (!node) return 1;

    depthStack.add(id);
    const prereqDepth = node.prereqs.reduce((max, prereq) => Math.max(max, kpDepth(prereq)), 0);
    depthStack.delete(id);

    const depth = prereqDepth + 1;
    depthMemo.set(id, depth);
    return depth;
  }

  function collectClosure(id: string): void {
    if (closure.has(id)) return;
    const node = graph.byId[id];
    if (!node) return;
    closure.add(id);
    for (const prereq of node.prereqs) collectClosure(prereq);
  }

  let maxDepth = 1;
  for (const id of dream.requires) {
    maxDepth = Math.max(maxDepth, kpDepth(id));
    collectClosure(id);
  }

  return Math.max(scoreKpDepth(maxDepth), scoreKpCount(closure.size)) as DreamDifficulty;
}

export function validateDreams(dreams: DreamDefinition[], graph: KnowledgeGraph): DreamValidation {
  const errors: DreamValidationError[] = [];
  const seen = new Set<string>();

  for (const dream of dreams) {
    if (seen.has(dream.id)) {
      errors.push({ kind: "duplicate-id", id: dream.id });
      continue;
    }
    seen.add(dream.id);
  }

  for (const dream of dreams) {
    if (dream.categories.length === 0) {
      errors.push({ kind: "empty-categories", id: dream.id });
    }
    if (dream.requires.length === 0) {
      errors.push({ kind: "empty-requires", id: dream.id });
    }
    for (const req of dream.requires) {
      if (!(req in graph.byId)) {
        errors.push({ kind: "unresolved-requires", id: dream.id, prereq: req });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const enrichedDreams: Dream[] = dreams.map((dream) => ({
    ...dream,
    difficulty: computeDreamDifficulty(dream, graph),
  }));
  const byId: Record<string, Dream> = Object.fromEntries(enrichedDreams.map((d) => [d.id, d]));
  return { ok: true, library: { dreams: enrichedDreams, byId } };
}

export async function loadDreams(dir: string, graph: KnowledgeGraph): Promise<DreamValidation> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, library: { dreams: [], byId: {} } };
    }
    throw err;
  }

  const ymlFiles = entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
  const dreams: DreamDefinition[] = [];
  for (const file of ymlFiles) {
    const path = join(dir, file);
    const text = await readFile(path, "utf8");
    try {
      dreams.push(parseDream(text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${file}: ${msg}`);
    }
  }
  return validateDreams(dreams, graph);
}
