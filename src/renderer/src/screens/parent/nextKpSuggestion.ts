import type { DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { KnowledgePointStatus, Progress } from "@shared/progress";
import { collectRequiredKps, kpLevel, pickNextKP, pickNextOpenKps } from "@shared/scheduler";

export type NextKpSuggestion =
  | { kind: "no-dream" }
  | { kind: "loading" }
  | { kind: "unknown-dream"; dreamId: string }
  | { kind: "unresolved-prereqs"; missing: string[] }
  | { kind: "next-kp"; kp: KnowledgePoint; status: KnowledgePointStatus | null }
  | { kind: "all-done" }
  | { kind: "freeform" };

export type ChooseNextSuggestionInput = {
  graph: KnowledgeGraph | null;
  library: DreamLibrary | null;
  currentDreamId: string | null;
  progress: Progress;
};

export function chooseNextSuggestion(input: ChooseNextSuggestionInput): NextKpSuggestion {
  const { graph, library, currentDreamId, progress } = input;
  if (!currentDreamId) return { kind: "no-dream" };
  if (!graph || !library) return { kind: "loading" };
  const dream = library.byId[currentDreamId];
  if (!dream) return { kind: "unknown-dream", dreamId: currentDreamId };
  if (dream.mode === "freeform") {
    const nextId = pickNextOpenKps(graph, progress, { limit: 1 })[0];
    if (!nextId) return { kind: "freeform" };
    const kp = graph.byId[nextId];
    if (!kp) return { kind: "freeform" };
    return { kind: "next-kp", kp, status: kpLevel(progress, nextId) };
  }
  const { unresolved } = collectRequiredKps(graph, dream);
  if (unresolved.length > 0) return { kind: "unresolved-prereqs", missing: unresolved };
  const nextId = pickNextKP(graph, dream, progress);
  if (!nextId) return { kind: "all-done" };
  const kp = graph.byId[nextId];
  if (!kp) return { kind: "unresolved-prereqs", missing: [nextId] };
  return { kind: "next-kp", kp, status: kpLevel(progress, nextId) };
}
