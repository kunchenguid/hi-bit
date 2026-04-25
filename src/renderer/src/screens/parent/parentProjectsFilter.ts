import type { ParentProjectRow } from "./parentProjectRows";

export type ParentProjectsStatusFilter = "all" | "active" | "removed";

export const PARENT_PROJECTS_STATUS_FILTERS: readonly ParentProjectsStatusFilter[] = [
  "all",
  "active",
  "removed",
] as const;

export const PARENT_PROJECTS_STATUS_FILTER_LABELS: Record<ParentProjectsStatusFilter, string> = {
  all: "all",
  active: "active",
  removed: "removed",
};

export function filterParentProjectsByStatus(
  rows: readonly ParentProjectRow[],
  filter: ParentProjectsStatusFilter,
): ParentProjectRow[] {
  if (filter === "all") return [...rows];
  if (filter === "active") return rows.filter((r) => r.isKnown);
  return rows.filter((r) => !r.isKnown);
}

export function countParentProjectsByStatusFilter(
  rows: readonly ParentProjectRow[],
): Record<ParentProjectsStatusFilter, number> {
  const counts: Record<ParentProjectsStatusFilter, number> = {
    all: rows.length,
    active: 0,
    removed: 0,
  };
  for (const row of rows) {
    if (row.isKnown) counts.active += 1;
    else counts.removed += 1;
  }
  return counts;
}
