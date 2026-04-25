import type { DreamLibrary } from "@shared/dreams";
import type { ProjectEntry } from "@shared/progress";
import { type JSX, useEffect, useMemo, useState } from "react";
import { buildPreviewSrcdoc } from "../../preview/buildPreview";
import { useParentProjectsStore } from "../../state/parentProjectsStore";
import { buildParentProjectRows } from "./parentProjectRows";
import {
  countParentProjectsByStatusFilter,
  filterParentProjectsByStatus,
  PARENT_PROJECTS_STATUS_FILTER_LABELS,
  PARENT_PROJECTS_STATUS_FILTERS,
  type ParentProjectsStatusFilter,
} from "./parentProjectsFilter";
import {
  normalizeParentProjectsSearchQuery,
  searchParentProjectsByText,
} from "./parentProjectsSearch";
import { describeParentRelativeTime } from "./parentRelativeTime";
import { describeProjectStarted } from "./projectStarted";

const EMPTY_PREVIEW = "<!doctype html><html><body></body></html>";

export type ParentProjectsReviewProps = {
  profileId: string;
  library: DreamLibrary | null;
  projects: ProjectEntry[];
  currentDreamId?: string | null;
};

function formatLastActive(iso: string | null): string {
  if (!iso) return "Never opened";
  return `Last active ${describeParentRelativeTime(iso)}`;
}

export function ParentProjectsReview({
  profileId,
  library,
  projects,
  currentDreamId,
}: ParentProjectsReviewProps): JSX.Element {
  const slugs = useParentProjectsStore((s) => s.slugs);
  const status = useParentProjectsStore((s) => s.status);
  const error = useParentProjectsStore((s) => s.error);
  const activeSlug = useParentProjectsStore((s) => s.activeSlug);
  const files = useParentProjectsStore((s) => s.files);
  const activeFileName = useParentProjectsStore((s) => s.activeFileName);
  const fileStatus = useParentProjectsStore((s) => s.fileStatus);
  const fileError = useParentProjectsStore((s) => s.fileError);
  const loadedProfileId = useParentProjectsStore((s) => s.profileId);
  const loadSlugs = useParentProjectsStore((s) => s.loadSlugs);
  const openProject = useParentProjectsStore((s) => s.openProject);
  const setActiveFile = useParentProjectsStore((s) => s.setActiveFile);
  const closeProject = useParentProjectsStore((s) => s.closeProject);

  const [srcdoc, setSrcdoc] = useState<string>(EMPTY_PREVIEW);
  const [previewMissing, setPreviewMissing] = useState(false);
  const [query, setQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ParentProjectsStatusFilter>("all");

  useEffect(() => {
    if (loadedProfileId !== profileId) void loadSlugs(profileId);
  }, [profileId, loadedProfileId, loadSlugs]);

  const activeFile = useMemo(
    () => files.find((f) => f.name === activeFileName) ?? null,
    [files, activeFileName],
  );

  useEffect(() => {
    if (fileStatus !== "ready" || files.length === 0) {
      setSrcdoc(EMPTY_PREVIEW);
      setPreviewMissing(false);
      return;
    }
    const result = buildPreviewSrcdoc(files);
    if (result.ok) {
      setSrcdoc(result.srcdoc);
      setPreviewMissing(false);
    } else {
      setSrcdoc(EMPTY_PREVIEW);
      setPreviewMissing(true);
    }
  }, [files, fileStatus]);

  if (status === "loading" || status === "idle") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Saved projects</h2>
        <p className="hb-parent-empty">Loading projects...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Saved projects</h2>
        <p className="hb-parent-empty">Could not load projects: {error}</p>
      </section>
    );
  }

  if (slugs.length === 0) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Saved projects</h2>
        <p className="hb-parent-empty">No projects saved yet.</p>
      </section>
    );
  }

  const allRows = buildParentProjectRows({ slugs, projects, library, currentDreamId });
  const trimmedQuery = normalizeParentProjectsSearchQuery(query);
  const statusCounts = countParentProjectsByStatusFilter(allRows);
  const filteredRows = filterParentProjectsByStatus(allRows, statusFilter);
  const rows = searchParentProjectsByText(filteredRows, query);

  let emptyText: string | null = null;
  if (rows.length === 0) {
    if (trimmedQuery.length > 0 && statusFilter !== "all") {
      emptyText = `No ${statusFilter} projects match "${trimmedQuery}".`;
    } else if (trimmedQuery.length > 0) {
      emptyText = `No projects match "${trimmedQuery}".`;
    } else {
      emptyText = `No ${statusFilter} projects yet.`;
    }
  }

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Saved projects</h2>
      <div className="hb-parent-projects-search">
        <label
          className="hb-parent-projects-search-label t-pixel"
          htmlFor="hb-parent-projects-search-input"
        >
          Search
        </label>
        <input
          id="hb-parent-projects-search-input"
          type="search"
          className="hb-parent-projects-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a project by title, slug, or dream id..."
        />
        {query.length > 0 ? (
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-parent-projects-search-clear"
            onClick={() => setQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>
      <fieldset className="hb-parent-projects-filter">
        <legend className="hb-parent-projects-filter-legend t-pixel">Show</legend>
        {PARENT_PROJECTS_STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="hb-parent-projects-filter-chip t-pixel"
            aria-pressed={statusFilter === f}
            onClick={() => setStatusFilter(f)}
          >
            <span className="hb-parent-projects-filter-chip-label">
              {PARENT_PROJECTS_STATUS_FILTER_LABELS[f]}
            </span>
            <span className="hb-parent-projects-filter-chip-count">{statusCounts[f]}</span>
          </button>
        ))}
      </fieldset>
      {emptyText ? (
        <p className="hb-parent-empty">{emptyText}</p>
      ) : (
        <ul className="hb-projects-list">
          {rows.map((row) => {
            const isActive = activeSlug === row.slug;
            const started = describeProjectStarted(row);
            return (
              <li key={row.slug} className="hb-projects-row">
                <button
                  type="button"
                  className={`hb-projects-row-toggle${isActive ? " hb-projects-row-active" : ""}`}
                  onClick={() => {
                    if (isActive) closeProject();
                    else void openProject(row.slug);
                  }}
                  aria-expanded={isActive}
                >
                  <span className="hb-projects-row-label">
                    <span className="hb-projects-row-title">{row.title}</span>
                    <span className="hb-projects-row-sub">
                      <span className="t-pixel hb-projects-row-slug">{row.slug}</span>
                      {row.isCurrent ? (
                        <span className="t-pixel hb-projects-row-current">Current</span>
                      ) : null}
                      {!row.isKnown && row.dreamId ? (
                        <span
                          className="t-pixel hb-projects-row-missing"
                          title="This dream id is no longer in the library."
                        >
                          Removed
                        </span>
                      ) : null}
                      {started ? (
                        <span
                          className="t-pixel hb-projects-row-started"
                          title={`Started ${started.startedAt}`}
                        >
                          Started {started.relative}
                        </span>
                      ) : null}
                      <span className="hb-projects-row-last">
                        {formatLastActive(row.lastActiveAt)}
                      </span>
                    </span>
                  </span>
                  <span className="hb-projects-row-meta">{isActive ? "Hide" : "Open"}</span>
                </button>
                {isActive ? (
                  <div className="hb-projects-detail">
                    {fileStatus === "loading" ? (
                      <p className="hb-parent-empty">Loading files...</p>
                    ) : fileStatus === "error" ? (
                      <p className="hb-parent-empty">Could not load files: {fileError}</p>
                    ) : files.length === 0 ? (
                      <p className="hb-parent-empty">This project has no files yet.</p>
                    ) : (
                      <div className="hb-projects-body">
                        <div className="hb-projects-tabs" role="tablist" aria-label="Project files">
                          {files.map((f) => {
                            const active = f.name === activeFileName;
                            return (
                              <button
                                key={f.name}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                className={`hb-editor-tab${active ? " hb-editor-tab-active" : ""}`}
                                onClick={() => setActiveFile(f.name)}
                              >
                                {f.name}
                              </button>
                            );
                          })}
                        </div>
                        {activeFile ? (
                          <textarea
                            key={activeFile.name}
                            className="hb-editor-textarea hb-projects-viewer"
                            value={activeFile.content}
                            readOnly
                            spellCheck={false}
                            aria-label={`Read-only viewer for ${activeFile.name}`}
                          />
                        ) : null}
                        <div className="hb-projects-preview">
                          <div className="t-pixel hb-gate-kicker">Live preview</div>
                          {previewMissing ? (
                            <p className="hb-editor-preview-hint">
                              No <code>index.html</code> in this project yet.
                            </p>
                          ) : null}
                          <iframe
                            className="hb-editor-iframe hb-projects-iframe"
                            title={`Preview of ${row.slug}`}
                            sandbox="allow-scripts"
                            srcDoc={srcdoc}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
