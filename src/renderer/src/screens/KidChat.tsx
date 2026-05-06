import mascotAvatarUrl from "@design/assets/logo-mark.svg";
import mascotBooUrl from "@design/assets/mascot-boo.svg";
import type { Dream } from "@shared/dreams";
import type { Profile } from "@shared/profile";
import {
  type FormEvent,
  type JSX,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { canRetryLastKidMessage, useChatStore } from "../state/chatStore";
import { useGraphStore } from "../state/graphStore";
import { useProfileStore } from "../state/profileStore";
import { useProgressStore } from "../state/progressStore";
import { ChatMarkdown } from "./chatMarkdown";
import { describeKidDreamProgress } from "./kidDreamProgress";
import { messageHasEditorCue } from "./kidEditorCue";
import { buildKidGreetingText } from "./kidGreeting";
import { describeKidNextUp } from "./kidNextUp";
import { buildKidSessionLearned, computeDoneKpIds } from "./kidSessionLearned";
import { buildKidSkillChecklist } from "./kidSkillChecklist";
import { buildKidWrapUpSummary } from "./kidWrapUp";
import { chooseNextSuggestion } from "./parent/nextKpSuggestion";

type Props = {
  profile: Profile;
  onOpenEditor?: () => void;
  onShowCursorTarget?: (snippet: string, latestBitMessage: string) => Promise<void>;
  onEnterParentMode?: () => void;
  onSwitchDream?: () => void;
  onOpenProjects?: () => void;
  cursorTargetStatus?: "idle" | "locating";
  cursorTargetError?: string | null;
  docked?: boolean;
  editorViewMode?: "code" | "preview" | "split";
};

export function KidChat({
  profile,
  onOpenEditor,
  onShowCursorTarget,
  onEnterParentMode,
  onSwitchDream,
  onOpenProjects,
  cursorTargetStatus = "idle",
  cursorTargetError = null,
  docked = false,
  editorViewMode = "code",
}: Props): JSX.Element {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const streamingText = useChatStore((s) => s.streamingText);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const hydrate = useChatStore((s) => s.hydrate);
  const hydrateStatus = useChatStore((s) => s.hydrateStatus);
  const hydratedSessionId = useChatStore((s) => s.hydratedSessionId);
  const greetingForSessionId = useChatStore((s) => s.greetingForSessionId);
  const seedKidGreeting = useChatStore((s) => s.seedKidGreeting);
  const appendStreamingDelta = useChatStore((s) => s.appendStreamingDelta);
  const library = useGraphStore((s) => s.library);
  const graph = useGraphStore((s) => s.graph);
  const graphStatus = useGraphStore((s) => s.status);
  const loadGraph = useGraphStore((s) => s.load);
  const progress = useProgressStore((s) => s.progress);
  const progressProfileId = useProgressStore((s) => s.profileId);
  const loadProgress = useProgressStore((s) => s.load);
  const selectProfile = useProfileStore((s) => s.selectProfile);

  const [input, setInput] = useState("");
  const [wrapUpOpen, setWrapUpOpen] = useState(false);
  const [sessionStartDone, setSessionStartDone] = useState<ReadonlySet<string> | null>(null);
  const [learnedDismissedCount, setLearnedDismissedCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (graphStatus === "idle") {
      void loadGraph();
    }
  }, [graphStatus, loadGraph]);

  useEffect(() => {
    const unsubscribe = window.hibit.onBitDelta((event) => {
      if (event.role === "kid" && event.profileId === profile.id) {
        appendStreamingDelta(event.requestId, event.text);
      }
    });
    return unsubscribe;
  }, [profile.id, appendStreamingDelta]);

  const kidSessionId = profile.sessions.kid;
  useEffect(() => {
    if (hydratedSessionId === kidSessionId) return;
    void hydrate(profile.id, kidSessionId);
  }, [profile.id, kidSessionId, hydratedSessionId, hydrate]);

  useEffect(() => {
    if (progressProfileId !== profile.id) void loadProgress(profile.id);
  }, [profile.id, progressProfileId, loadProgress]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on profile change
  useEffect(() => {
    setSessionStartDone(null);
    setLearnedDismissedCount(0);
  }, [profile.id]);

  useEffect(() => {
    if (sessionStartDone !== null) return;
    if (!progress || !graph) return;
    if (progressProfileId !== profile.id) return;
    setSessionStartDone(computeDoneKpIds(graph, progress));
  }, [graph, progress, progressProfileId, profile.id, sessionStartDone]);

  const dream = useMemo<Dream | null>(() => {
    if (!library || !profile.currentDreamId) return null;
    return library.byId[profile.currentDreamId] ?? null;
  }, [library, profile.currentDreamId]);

  const nextSuggestion = useMemo(() => {
    if (!progress) return null;
    if (dream?.mode === "freeform") return null;
    return chooseNextSuggestion({
      graph,
      library,
      currentDreamId: profile.currentDreamId ?? null,
      progress,
    });
  }, [dream?.mode, graph, library, profile.currentDreamId, progress]);

  const nextUp = useMemo(() => describeKidNextUp(nextSuggestion), [nextSuggestion]);
  const nextUpKpId = nextSuggestion?.kind === "next-kp" ? nextSuggestion.kp.id : null;

  useEffect(() => {
    if (prevStatusRef.current === "sending" && status !== "sending") {
      inputRef.current?.focus();
    }
    prevStatusRef.current = status;
  }, [status]);

  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const lastBitTextMessageId = [...messages]
    .reverse()
    .find((m) => m.role === "bit" && m.kind === "text")?.id;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Track lastMessageId, status, and streamingText so the thinking/streaming
    // bubble keeps scrolling into view as deltas arrive.
    void lastMessageId;
    void status;
    void streamingText;
    el.scrollTop = el.scrollHeight;
  }, [lastMessageId, status, streamingText]);

  const dreamProgress = useMemo(
    () => describeKidDreamProgress(dream, graph, progress),
    [dream, graph, progress],
  );

  const skillChecklist = useMemo(
    () => buildKidSkillChecklist(dream, graph, progress, nextUpKpId),
    [dream, graph, progress, nextUpKpId],
  );

  const sessionLearned = useMemo(
    () => buildKidSessionLearned(graph, progress, sessionStartDone),
    [graph, progress, sessionStartDone],
  );

  const kidMessageCount = useMemo(
    () => messages.filter((m) => m.role === "kid" && m.kind === "text").length,
    [messages],
  );

  const wrapUpSummary = useMemo(
    () =>
      buildKidWrapUpSummary({
        profileName: profile.name,
        kidMessageCount,
        doneSkillCount: skillChecklist?.doneCount ?? 0,
      }),
    [profile.name, kidMessageCount, skillChecklist],
  );

  useEffect(() => {
    if (hydrateStatus !== "ready") return;
    if (hydratedSessionId !== kidSessionId) return;
    if (messages.length > 0) return;
    if (greetingForSessionId === kidSessionId) return;
    if (!dream) return;
    const greeting = buildKidGreetingText({
      profileName: profile.name,
      dreamTitleKid: dream.title_kid,
      dreamMode: dream.mode,
      nextUpText: nextUp?.text ?? null,
    });
    seedKidGreeting(kidSessionId, greeting);
  }, [
    hydrateStatus,
    hydratedSessionId,
    kidSessionId,
    messages.length,
    greetingForSessionId,
    dream,
    nextUp,
    profile.name,
    seedKidGreeting,
  ]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length === 0 || status === "sending") return;
    setInput("");
    const uiContext =
      editorViewMode === "preview"
        ? "The editor is already open next to chat. The kid is currently looking at Page view, so code is not visible. Do not ask the kid to click Open the editor; first guide them to press See my code or Split before giving any code-edit instructions."
        : "The editor is already open next to chat. Do not ask the kid to click Open the editor; guide them using the visible editor controls instead.";
    await send(profile.id, trimmed, docked ? { uiContext } : undefined);
  }

  const disabled = status === "sending" || input.trim().length === 0;
  const canRetry = status !== "sending" && canRetryLastKidMessage(messages);
  const visibleSessionLearned = sessionLearned && sessionLearned.count > learnedDismissedCount;
  const showSkillChecklist = skillChecklist && skillChecklist.totalCount > 1;
  const showLearningStrip = visibleSessionLearned || nextUp || showSkillChecklist || dreamProgress;

  async function handleRetry(): Promise<void> {
    if (!canRetry) return;
    await retry(profile.id);
  }

  async function handleBackToProfiles(): Promise<void> {
    try {
      await window.hibit.endKidSession(profile.id);
    } finally {
      setWrapUpOpen(false);
      selectProfile(null);
    }
  }

  const Shell = docked ? "section" : "main";
  const shellClass = `hb-chat-shell${docked ? " hb-chat-shell-docked" : ""}`;

  return (
    <Shell className={shellClass}>
      <header className="hb-chat-header">
        <div className="hb-chat-heading">
          {docked ? null : <div className="t-pixel hb-gate-kicker">Bit</div>}
          <h1 className="hb-chat-title">
            {docked ? (
              "Bit"
            ) : (
              <>
                {profile.name} and Bit
                {dream ? <span className="hb-chat-dream"> - {dream.title_kid}</span> : null}
              </>
            )}
          </h1>
          {showLearningStrip ? (
            <div className="hb-chat-learning-strip">
              {visibleSessionLearned ? (
                <div className="hb-chat-session-learned" role="status" aria-live="polite">
                  <span className="hb-chat-session-learned-text">{sessionLearned.text}</span>
                  <button
                    type="button"
                    className="hb-chat-session-learned-dismiss"
                    onClick={() => setLearnedDismissedCount(sessionLearned.count)}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              {nextUp ? (
                <div className="hb-chat-nextup-group">
                  <p className="hb-chat-nextup">
                    <span className="hb-chat-nextup-label">{nextUp.label}:</span>{" "}
                    <span className="hb-chat-nextup-text">{nextUp.text}</span>
                  </p>
                  {nextUp.subtext && !docked ? (
                    <p className="hb-chat-nextup-why">{nextUp.subtext}</p>
                  ) : null}
                </div>
              ) : null}
              {showSkillChecklist ? (
                <details className="hb-chat-skill-checklist">
                  <summary className="hb-chat-skill-checklist-summary">
                    <span className="hb-chat-skill-checklist-kicker t-pixel">Skill map</span>
                    <span className="hb-chat-skill-checklist-count">{skillChecklist.summary}</span>
                  </summary>
                  <ul className="hb-chat-skill-list">
                    {skillChecklist.items.map((item) => (
                      <li
                        key={item.id}
                        className={`hb-chat-skill-item hb-chat-skill-item-${item.status}`}
                      >
                        <span className="hb-chat-skill-icon" aria-hidden="true">
                          {item.status === "done" ? "✓" : item.status === "next" ? "→" : "○"}
                        </span>
                        <span className="hb-chat-skill-label">{item.titleKid}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : dreamProgress ? (
                <span className="hb-chat-dream-progress t-pixel">
                  <span className="hb-chat-dream-progress-kicker">{dreamProgress.kicker}</span>
                  <span className="hb-chat-dream-progress-text">{dreamProgress.text}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="hb-chat-header-actions">
          <div className="hb-chat-header-chrome">
            {onSwitchDream ? (
              <button
                type="button"
                className="hb-btn hb-btn-ghost hb-btn-sm"
                onClick={onSwitchDream}
              >
                Switch dream
              </button>
            ) : null}
            {onOpenProjects ? (
              <button
                type="button"
                className="hb-btn hb-btn-ghost hb-btn-sm"
                onClick={onOpenProjects}
              >
                My projects
              </button>
            ) : null}
            {onEnterParentMode ? (
              <button
                type="button"
                className="hb-btn hb-btn-ghost hb-btn-sm hb-btn-parent"
                onClick={onEnterParentMode}
              >
                For grown-ups
              </button>
            ) : null}
          </div>
          {onOpenEditor && !docked ? (
            <button type="button" className="hb-btn hb-btn-primary" onClick={onOpenEditor}>
              Open editor
            </button>
          ) : null}
        </div>
      </header>

      <div className="hb-chat-messages" ref={listRef}>
        {hydrateStatus === "loading" && messages.length === 0 ? (
          <p className="hb-chat-empty">Loading your last chat with Bit...</p>
        ) : null}
        {hydrateStatus !== "loading" && messages.length === 0 ? (
          <div className="hb-chat-empty">
            <img
              className="hb-chat-empty-mascot"
              src={mascotBooUrl}
              alt=""
              aria-hidden="true"
              width={160}
              height={160}
            />
            <p className="hb-chat-empty-text">
              Say hi to Bit when you're ready. Bit will greet you and tell you the first move.
            </p>
          </div>
        ) : null}
        {messages.map((m, idx) => {
          if (m.role === "system" && m.kind === "divider") {
            return (
              <div key={m.id} className="hb-chat-divider">
                <span className="hb-chat-divider-line" aria-hidden="true" />
                <span className="hb-chat-divider-text">{m.text}</span>
                <span className="hb-chat-divider-line" aria-hidden="true" />
              </div>
            );
          }
          const isLastError = idx === messages.length - 1 && m.role === "bit" && m.kind === "error";
          const showEditorCta =
            !docked &&
            m.role === "bit" &&
            m.kind !== "error" &&
            !!onOpenEditor &&
            messageHasEditorCue(m.text);
          const isLatestBitText =
            m.id === lastBitTextMessageId && m.role === "bit" && m.kind === "text";
          const onBlockShowCursor =
            onShowCursorTarget && isLatestBitText && status !== "sending"
              ? (snippet: string) => {
                  void onShowCursorTarget(snippet, m.text);
                }
              : undefined;
          const bubble = (
            <div
              className={`hb-chat-msg hb-chat-${m.role}${
                m.kind === "error" ? " hb-chat-msg-error" : ""
              }`}
            >
              <div className="hb-chat-msg-role t-pixel">
                {m.role === "kid" ? profile.name : "Bit"}
              </div>
              <div className="hb-chat-msg-body">
                {m.role === "bit" && m.kind !== "error" ? (
                  <ChatMarkdown
                    text={m.text}
                    onShowCursorTarget={onBlockShowCursor}
                    cursorTargetStatus={cursorTargetStatus}
                  />
                ) : (
                  m.text
                )}
              </div>
              {showEditorCta ? (
                <button
                  type="button"
                  className="hb-btn hb-btn-primary hb-chat-editor-cta"
                  onClick={onOpenEditor}
                >
                  Open the editor
                </button>
              ) : null}
              {isLatestBitText && cursorTargetError ? (
                <p className="hb-chat-cursor-target-error">{cursorTargetError}</p>
              ) : null}
              {isLastError && canRetry ? (
                <button
                  type="button"
                  className="hb-btn hb-btn-ghost hb-chat-retry"
                  onClick={handleRetry}
                >
                  Try again
                </button>
              ) : null}
            </div>
          );
          if (m.role === "bit") {
            return (
              <div key={m.id} className="hb-chat-row hb-chat-row-bit">
                <img
                  className="hb-chat-avatar"
                  src={mascotAvatarUrl}
                  alt=""
                  aria-hidden="true"
                  width={36}
                  height={36}
                />
                {bubble}
              </div>
            );
          }
          return (
            <div key={m.id} className="hb-chat-row hb-chat-row-kid">
              {bubble}
            </div>
          );
        })}
        {status === "sending" ? (
          <div className="hb-chat-row hb-chat-row-bit">
            <img
              className="hb-chat-avatar hb-chat-avatar-thinking"
              src={mascotAvatarUrl}
              alt=""
              aria-hidden="true"
              width={36}
              height={36}
            />
            <div className="hb-chat-msg hb-chat-bit hb-chat-msg-pending">
              <div className="hb-chat-msg-role t-pixel">Bit</div>
              {streamingText && streamingText.length > 0 ? (
                <div className="hb-chat-msg-body hb-chat-streaming">{streamingText}</div>
              ) : (
                <div className="hb-chat-msg-body hb-chat-thinking">
                  <span className="hb-chat-thinking-label">Bit is thinking</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <form className="hb-chat-input-row" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="hb-input hb-chat-input"
          type="text"
          placeholder="type to Bit..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status === "sending"}
          // biome-ignore lint/a11y/noAutofocus: primary input on kid home screen
          autoFocus
        />
        <button type="submit" className="hb-btn hb-btn-primary" disabled={disabled}>
          {status === "sending" ? (
            "Sending..."
          ) : (
            <>
              <svg
                className="hb-chat-send-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="16"
                height="16"
              >
                <path
                  d="M3.4 20.6L21 12 3.4 3.4 3 10l12 2-12 2z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </svg>
              Send
            </>
          )}
        </button>
        <button
          type="button"
          className="hb-btn hb-btn-ghost hb-btn-sm hb-chat-done"
          onClick={() => setWrapUpOpen(true)}
          disabled={status === "sending"}
        >
          I'm done for now
        </button>
      </form>

      {wrapUpOpen ? (
        <section
          className="hb-chat-wrapup"
          aria-label="Done for today"
          aria-modal="true"
          role="dialog"
        >
          <div className="hb-chat-wrapup-card">
            <h2 className="hb-chat-wrapup-title">{wrapUpSummary.title}</h2>
            <p className="hb-chat-wrapup-subtitle">{wrapUpSummary.subtitle}</p>
            <div className="hb-chat-wrapup-actions">
              <button
                type="button"
                className="hb-btn hb-btn-ghost"
                onClick={() => setWrapUpOpen(false)}
              >
                Keep going
              </button>
              <button
                type="button"
                className="hb-btn hb-btn-primary"
                onClick={() => void handleBackToProfiles()}
              >
                Back to profiles
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </Shell>
  );
}
