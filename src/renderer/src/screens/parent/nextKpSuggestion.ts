import type { DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph, KnowledgePoint } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { collectRequiredKps, pickNextKP } from "@shared/scheduler";

export type NextKpSuggestion =
  | { kind: "no-dream" }
  | { kind: "loading" }
  | { kind: "unknown-dream"; dreamId: string }
  | { kind: "unresolved-prereqs"; missing: string[] }
  | { kind: "next-kp"; kp: KnowledgePoint }
  | { kind: "all-done" };

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
  const { unresolved } = collectRequiredKps(graph, dream);
  if (unresolved.length > 0) return { kind: "unresolved-prereqs", missing: unresolved };
  const nextId = pickNextKP(graph, dream, progress);
  if (!nextId) return { kind: "all-done" };
  const kp = graph.byId[nextId];
  if (!kp) return { kind: "unresolved-prereqs", missing: [nextId] };
  return { kind: "next-kp", kp };
}
