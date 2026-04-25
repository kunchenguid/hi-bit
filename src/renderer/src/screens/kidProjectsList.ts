import type { DreamCategory, DreamLibrary } from "@shared/dreams";
import type { ProjectEntry } from "@shared/progress";

export type KidProjectListEntry = {
  dreamId: string;
  slug: string;
  title: string;
  summary: string | null;
  categories: readonly DreamCategory[];
  startedAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
};

export type BuildKidProjectListInput = {
  projects: ProjectEntry[];
  library: DreamLibrary | null;
  currentDreamId?: string | null;
};

export function buildKidProjectList(input: BuildKidProjectListInput): KidProjectListEntry[] {
  const { projects, library, currentDreamId } = input;
  const entries = projects.map((p) => {
    const dream = library?.byId[p.dreamId] ?? null;
    return {
      dreamId: p.dreamId,
      slug: p.slug,
      title: dream?.title_kid ?? p.dreamId,
      summary: dream?.summary_kid ?? null,
      categories: dream?.categories ?? [],
      startedAt: p.startedAt,
      lastActiveAt: p.lastActiveAt,
      isCurrent: !!currentDreamId && p.dreamId === currentDreamId,
    } satisfies KidProjectListEntry;
  });
  return entries.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}
