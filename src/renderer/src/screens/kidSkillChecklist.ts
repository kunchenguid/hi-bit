import type { Dream } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import { kpMeets } from "@shared/scheduler";

export type KidSkillStatus = "done" | "next" | "pending";

export type KidSkillItem = {
  id: string;
  titleKid: string;
  status: KidSkillStatus;
};

export type KidSkillChecklist = {
  items: KidSkillItem[];
  doneCount: number;
  totalCount: number;
  summary: string;
};

export function buildKidSkillChecklist(
  dream: Dream | null,
  graph: KnowledgeGraph | null,
  progress: Progress | null,
  nextUpKpId: string | null,
): KidSkillChecklist | null {
  if (!dream) return null;
  if (!graph) return null;
  if (dream.requires.length === 0) return null;

  const items: KidSkillItem[] = [];
  for (const id of dream.requires) {
    const kp = graph.byId[id];
    if (!kp) continue;
    const isDone = progress ? kpMeets(progress, id, "did_with_help") : false;
    const status: KidSkillStatus = isDone ? "done" : id === nextUpKpId ? "next" : "pending";
    items.push({ id, titleKid: kp.title_kid, status });
  }

  if (items.length === 0) return null;

  const doneCount = items.reduce((acc, item) => acc + (item.status === "done" ? 1 : 0), 0);
  const totalCount = items.length;
  return {
    items,
    doneCount,
    totalCount,
    summary: `${doneCount} of ${totalCount} done`,
  };
}
