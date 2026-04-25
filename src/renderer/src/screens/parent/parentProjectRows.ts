import type { DreamLibrary } from "@shared/dreams";
import type { ProjectEntry } from "@shared/progress";

export type ParentProjectRow = {
  slug: string;
  dreamId: string | null;
  title: string;
  startedAt: string | null;
  lastActiveAt: string | null;
  isCurrent: boolean;
  isKnown: boolean;
};

export type BuildParentProjectRowsInput = {
  slugs: string[];
  projects: ProjectEntry[];
  library: DreamLibrary | null;
  currentDreamId?: string | null;
};

export function buildParentProjectRows(input: BuildParentProjectRowsInput): ParentProjectRow[] {
  const { slugs, projects, library, currentDreamId } = input;
  const bySlug = new Map<string, ProjectEntry>();
  for (const p of projects) bySlug.set(p.slug, p);
  const rows = slugs.map((slug) => {
    const entry = bySlug.get(slug) ?? null;
    const dreamId = entry?.dreamId ?? null;
    const dream = dreamId && library ? (library.byId[dreamId] ?? null) : null;
    return {
      slug,
      dreamId,
      title: dream?.title_parent ?? dreamId ?? slug,
      startedAt: entry?.startedAt ?? null,
      lastActiveAt: entry?.lastActiveAt ?? null,
      isCurrent: !!currentDreamId && dreamId === currentDreamId,
      isKnown: dream !== null,
    } satisfies ParentProjectRow;
  });
  return rows.sort((a, b) => {
    if (a.lastActiveAt && b.lastActiveAt) return b.lastActiveAt.localeCompare(a.lastActiveAt);
    if (a.lastActiveAt) return -1;
    if (b.lastActiveAt) return 1;
    return a.slug.localeCompare(b.slug);
  });
}
