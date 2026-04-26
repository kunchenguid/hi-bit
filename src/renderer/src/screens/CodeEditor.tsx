import type { Dream } from "@shared/dreams";
import type { Profile } from "@shared/profile";
import {
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CodeMirrorEditor, type CodeMirrorHandle } from "../editor/CodeMirrorEditor";
import { buildPreviewSrcdoc } from "../preview/buildPreview";
import { useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProjectsStore } from "../state/projectsStore";
import { buildSavedFilePrompt } from "../state/saveReaction";
import { validateNewFilename } from "./newFileValidation";
import { computeNextTabIndex } from "./tablistNavigation";

type NewFileStatus = "closed" | "open" | "creating";

const EMPTY_PREVIEW = "<!doctype html><html><body></body></html>";

type Props = {
  profile: Profile;
  onBackToChat?: () => void;
  onEnterParentMode?: () => void;
  docked?: boolean;
  cursorTarget?: EditorCursorTarget | null;
  onCursorTargetCleared?: () => void;
};

export type EditorCursorTarget = {
  filename: string;
  position: number;
  requestId: number;
};

export function CodeEditor({
  profile,
  onBackToChat,
  onEnterParentMode,
  docked = false,
  cursorTarget = null,
  onCursorTargetCleared,
}: Props): JSX.Element {
  const status = useProjectsStore((s) => s.status);
  const buffers = useProjectsStore((s) => s.buffers);
  const activeFileName = useProjectsStore((s) => s.activeFileName);
  const error = useProjectsStore((s) => s.error);
  const loadProject = useProjectsStore((s) => s.load);
  const setActiveFile = useProjectsStore((s) => s.setActiveFile);
  const updateBuffer = useProjectsStore((s) => s.updateBuffer);
  const save = useProjectsStore((s) => s.save);
  const createFile = useProjectsStore((s) => s.createFile);
  const subscribe = useProjectsStore((s) => s.subscribe);
  const unsubscribe = useProjectsStore((s) => s.unsubscribe);
  const openFolder = useProjectsStore((s) => s.openFolder);
  const sendSystemPrompt = useChatStore((s) => s.sendSystemPrompt);

  const library = useGraphStore((s) => s.library);
  const graphStatus = useGraphStore((s) => s.status);
  const loadGraph = useGraphStore((s) => s.load);

  const [srcdoc, setSrcdoc] = useState<string>(EMPTY_PREVIEW);
  const [previewMissing, setPreviewMissing] = useState(false);
  const didAutoPreviewRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openFolderError, setOpenFolderError] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [newFileStatus, setNewFileStatus] = useState<NewFileStatus>("closed");
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const editorRef = useRef<CodeMirrorHandle | null>(null);

  useEffect(() => {
    if (graphStatus === "idle") void loadGraph();
  }, [graphStatus, loadGraph]);

  const dreamId = profile.currentDreamId;
  useEffect(() => {
    if (!dreamId) return;
    void loadProject(profile.id, dreamId);
  }, [profile.id, dreamId, loadProject]);

  useEffect(() => {
    if (status !== "ready") return;
    void subscribe();
    return () => {
      void unsubscribe();
    };
  }, [status, subscribe, unsubscribe]);

  const dream = useMemo<Dream | null>(() => {
    if (!library || !dreamId) return null;
    return library.byId[dreamId] ?? null;
  }, [library, dreamId]);

  const activeBuffer = useMemo(
    () => buffers.find((b) => b.name === activeFileName) ?? null,
    [buffers, activeFileName],
  );
  const isDirty = activeBuffer ? activeBuffer.content !== activeBuffer.savedContent : false;

  useEffect(() => {
    if (!cursorTarget) return;
    if (cursorTarget.filename === activeFileName) return;
    if (!buffers.some((b) => b.name === cursorTarget.filename)) return;
    setActiveFile(cursorTarget.filename);
  }, [cursorTarget, activeFileName, buffers, setActiveFile]);

  async function handleSave(): Promise<void> {
    if (!activeBuffer) return;
    setSaveError(null);
    try {
      const saved = await save(activeBuffer.name);
      rebuildPreview();
      void sendSystemPrompt(profile.id, {
        label: `Saved ${saved.filename}`,
        prompt: buildSavedFilePrompt(saved),
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save the file.");
    }
  }

  function rebuildPreview(): void {
    const files = useProjectsStore.getState().buffers.map((b) => ({
      name: b.name,
      content: b.content,
    }));
    const result = buildPreviewSrcdoc(files);
    if (result.ok) {
      setSrcdoc(result.srcdoc);
      setPreviewMissing(false);
    } else {
      setSrcdoc(EMPTY_PREVIEW);
      setPreviewMissing(true);
    }
  }

  async function handleOpenFolder(): Promise<void> {
    setOpenFolderError(null);
    const result = await openFolder();
    if (!result.ok) {
      setOpenFolderError(result.error);
    }
  }

  async function handlePaste(): Promise<void> {
    setPasteError(null);
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
      setPasteError("Your browser is blocking paste. Use Cmd+V or Ctrl+V instead.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text.length === 0) return;
      editorRef.current?.insertText(text);
    } catch {
      setPasteError("Couldn't read what you copied. Click in the code first, then try again.");
    }
  }

  function openNewFileForm(): void {
    setNewFileStatus("open");
    setNewFileName("");
    setNewFileError(null);
  }

  function cancelNewFileForm(): void {
    setNewFileStatus("closed");
    setNewFileName("");
    setNewFileError(null);
  }

  function handleNewFileKeyDown(e: KeyboardEvent<HTMLFormElement>): void {
    if (e.key === "Escape" && newFileStatus !== "creating") {
      e.preventDefault();
      cancelNewFileForm();
    }
  }

  function handleTabKeyDown(index: number, e: KeyboardEvent<HTMLButtonElement>): void {
    const next = computeNextTabIndex(index, buffers.length, e.key);
    if (next === null) return;
    e.preventDefault();
    const nextBuffer = buffers[next];
    if (!nextBuffer) return;
    setActiveFile(nextBuffer.name);
    tabRefs.current[next]?.focus();
  }

  async function handleCreateFile(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (newFileStatus === "creating") return;
    const existing = buffers.map((b) => b.name);
    const result = validateNewFilename(newFileName, existing);
    if (!result.ok) {
      setNewFileError(result.error);
      return;
    }
    setNewFileStatus("creating");
    setNewFileError(null);
    try {
      await createFile(result.name, "");
      setNewFileStatus("closed");
      setNewFileName("");
    } catch (err) {
      setNewFileError(err instanceof Error ? err.message : "Could not create the file.");
      setNewFileStatus("open");
    }
  }

  function handleRun(): void {
    rebuildPreview();
  }

  useEffect(() => {
    if (status !== "ready") return;
    if (didAutoPreviewRef.current) return;
    if (buffers.length === 0) return;
    const files = buffers.map((b) => ({ name: b.name, content: b.content }));
    const result = buildPreviewSrcdoc(files);
    if (result.ok) {
      setSrcdoc(result.srcdoc);
      setPreviewMissing(false);
    } else {
      setPreviewMissing(true);
    }
    didAutoPreviewRef.current = true;
  }, [status, buffers]);

  const Shell = docked ? "section" : "main";
  const shellClass = `hb-editor-shell${docked ? " hb-editor-shell-docked" : ""}`;

  return (
    <Shell className={shellClass}>
      <header className="hb-editor-header">
        <div className="hb-editor-heading">
          <div className="t-pixel hb-gate-kicker">Build</div>
          <h1 className="hb-editor-title">
            {profile.name}'s project
            {dream ? <span className="hb-chat-dream"> - {dream.title_kid}</span> : null}
          </h1>
        </div>
        <div className="hb-chat-header-actions">
          {onBackToChat && !docked ? (
            <button type="button" className="hb-btn hb-btn-ghost" onClick={onBackToChat}>
              Chat with Bit
            </button>
          ) : null}
          {onEnterParentMode && !docked ? (
            <button
              type="button"
              className="hb-btn hb-btn-ghost hb-btn-parent"
              onClick={onEnterParentMode}
            >
              For grown-ups
            </button>
          ) : null}
        </div>
      </header>

      {status === "loading" || status === "idle" ? (
        <p className="hb-gate-loading">loading files...</p>
      ) : null}
      {status === "error" ? (
        <p className="hb-form-err">Could not open your project: {error ?? "unknown error"}</p>
      ) : null}

      {status === "ready" ? (
        <div className={`hb-editor-body${docked ? " hb-editor-body-stacked" : ""}`}>
          <section className="hb-editor-pane">
            <div className="hb-editor-tabs" role="tablist" aria-label="Project files">
              {buffers.length === 0 ? (
                <span className="hb-editor-tabs-empty">No files yet.</span>
              ) : null}
              {buffers.map((b, idx) => {
                const dirty = b.content !== b.savedContent;
                const active = b.name === activeFileName;
                return (
                  <button
                    key={b.name}
                    ref={(el) => {
                      tabRefs.current[idx] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    className={`hb-editor-tab${active ? " hb-editor-tab-active" : ""}`}
                    onClick={() => setActiveFile(b.name)}
                    onKeyDown={(e) => handleTabKeyDown(idx, e)}
                  >
                    <span>{b.name}</span>
                    {dirty ? (
                      <span className="hb-editor-dirty" role="img" aria-label="unsaved changes">
                        *
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {newFileStatus === "closed" ? (
                <button
                  type="button"
                  className="hb-editor-tab hb-editor-tab-add"
                  onClick={openNewFileForm}
                >
                  + New file
                </button>
              ) : null}
            </div>

            {newFileStatus !== "closed" ? (
              <form
                className="hb-editor-new-file"
                onSubmit={handleCreateFile}
                onKeyDown={handleNewFileKeyDown}
              >
                <label className="hb-editor-new-file-label" htmlFor="hb-new-file-name">
                  <span className="t-pixel hb-gate-kicker">New file</span>
                </label>
                <input
                  id="hb-new-file-name"
                  className="hb-input hb-editor-new-file-input"
                  type="text"
                  placeholder="snake.js"
                  value={newFileName}
                  onChange={(e) => {
                    setNewFileName(e.target.value);
                    if (newFileError !== null) setNewFileError(null);
                  }}
                  disabled={newFileStatus === "creating"}
                  aria-invalid={newFileError !== null}
                  // biome-ignore lint/a11y/noAutofocus: form is user-opened, focus is expected
                  autoFocus
                />
                <div className="hb-editor-new-file-actions">
                  <button
                    type="button"
                    className="hb-btn hb-btn-ghost"
                    onClick={cancelNewFileForm}
                    disabled={newFileStatus === "creating"}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="hb-btn hb-btn-primary"
                    disabled={newFileStatus === "creating" || newFileName.trim().length === 0}
                  >
                    {newFileStatus === "creating" ? "Creating..." : "Create"}
                  </button>
                </div>
                {newFileError ? (
                  <p className="hb-form-err hb-editor-new-file-error">{newFileError}</p>
                ) : null}
              </form>
            ) : null}

            {activeBuffer ? (
              <CodeMirrorEditor
                key={activeBuffer.name}
                ref={editorRef}
                filename={activeBuffer.name}
                value={activeBuffer.content}
                onChange={(next) => {
                  if (cursorTarget?.filename === activeBuffer.name) onCursorTargetCleared?.();
                  updateBuffer(activeBuffer.name, next);
                }}
                onSave={() => {
                  void handleSave();
                }}
                ariaLabel={`Code editor for ${activeBuffer.name}`}
                cursorMarker={
                  cursorTarget && cursorTarget.filename === activeBuffer.name
                    ? { position: cursorTarget.position, key: cursorTarget.requestId }
                    : null
                }
              />
            ) : (
              <p className="hb-chat-empty">Ask Bit to help you make your first file.</p>
            )}

            <div className="hb-editor-toolbar">
              {activeBuffer && !isDirty ? (
                <span className="hb-editor-saved-status" aria-live="polite">
                  <span aria-hidden="true">✓</span> All saved
                </span>
              ) : (
                <button
                  type="button"
                  className="hb-btn hb-btn-ghost"
                  onClick={handleSave}
                  disabled={!activeBuffer || !isDirty}
                >
                  Save
                </button>
              )}
              <button
                type="button"
                className="hb-btn hb-btn-ghost"
                onClick={() => {
                  void handlePaste();
                }}
                disabled={!activeBuffer}
              >
                Paste
              </button>
              <button
                type="button"
                className="hb-btn hb-btn-ghost"
                onClick={() => {
                  void handleOpenFolder();
                }}
              >
                Open folder
              </button>
              <button
                type="button"
                className="hb-btn hb-btn-primary"
                onClick={handleRun}
                disabled={buffers.length === 0}
              >
                See my page
              </button>
            </div>

            {saveError ? <p className="hb-form-err">{saveError}</p> : null}
            {pasteError ? <p className="hb-form-err">{pasteError}</p> : null}
            {openFolderError ? <p className="hb-form-err">{openFolderError}</p> : null}
          </section>

          <section className="hb-editor-preview" aria-label="Live preview">
            <div className="t-pixel hb-gate-kicker">Live preview</div>
            {previewMissing ? (
              <p className="hb-editor-preview-hint">
                Add an <code>index.html</code> and press Run to see your page.
              </p>
            ) : null}
            <iframe
              key={srcdoc}
              className="hb-editor-iframe"
              title="Live preview"
              sandbox="allow-scripts allow-modals"
              srcDoc={srcdoc}
            />
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
