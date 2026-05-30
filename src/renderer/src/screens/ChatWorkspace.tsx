import type { AuthStatus } from "@shared/auth";
import type { ChatMessage, CreationActivity, PreviewInfo, TurnKind } from "@shared/chat";
import { isConceptUnlocked } from "@shared/concepts";
import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import { ActivityChip } from "../components/ActivityChip";
import { ActivityView } from "../components/ActivityView";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";
import { PreviewPane } from "../components/PreviewPane";
import { ProfileSettingsMenu } from "../components/ProfileSettingsMenu";

type ChatWorkspaceProps = {
  authStatus: AuthStatus | null;
  profile: ProfileSummary;
  messages: ChatMessage[];
  activity: CreationActivity[];
  showActivity: boolean;
  draft: string;
  running: boolean;
  activeTurn: { id: string; kind: TurnKind } | null;
  busy: boolean;
  error: string | null;
  previews: PreviewInfo[];
  playableProjectIds: string[];
  activePreview: PreviewInfo | null;
  reloadSignal: number;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onOpenFolder: () => void;
  onSwitchProfile: () => void;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
  onShowActivity: () => void;
  onHideActivity: () => void;
  onPlayPreview: (projectId: string) => void;
  onClosePreview: () => void;
  onOpenPreviewExternal: (url: string) => void;
};

export function ChatWorkspace({
  authStatus,
  profile,
  messages,
  activity,
  showActivity,
  draft,
  running,
  activeTurn,
  busy,
  error,
  previews,
  playableProjectIds,
  activePreview,
  reloadSignal,
  onDraftChange,
  onSend,
  onAbort,
  onOpenFolder,
  onSwitchProfile,
  onUpdateProfile,
  onShowActivity,
  onHideActivity,
  onPlayPreview,
  onClosePreview,
  onOpenPreviewExternal,
}: ChatWorkspaceProps) {
  const providerStatus = authStatus?.accountId
    ? `Codex provider connected (${authStatus.accountId})`
    : "Codex provider connected";

  // Show the pending Bit bubble during the gap before Bit's first streamed
  // token (and any tool-only stretches). Once the active turn's own bubble is
  // streaming, its text is the liveness cue and the dots step aside. Keying off
  // the active turn's id (not "is the last message an assistant one") is what
  // lets a bot-result turn surface dots even when an older Bit reply is the
  // last message on screen.
  const activeBubbleId = activeTurn ? `assistant-${activeTurn.id}` : null;
  const streaming = activeBubbleId !== null && messages.some((m) => m.id === activeBubbleId);
  const thinking = (running || activeTurn !== null) && !streaming;
  // Word the bubble for the kid: a bot-result turn is Bit reading what a
  // bot just built, anything else is Bit replying to the builder.
  const thinkingReason: TurnKind = activeTurn?.kind === "bot_result" ? "bot_result" : "reply";

  // Chrome labels follow the kid's unlocked vocabulary: the collection becomes
  // "your Workshop" and the activity surface becomes "Logbook" once earned.
  const workshopUnlocked = isConceptUnlocked(profile.unlockedConcepts, "workshop");
  const logbookUnlocked = isConceptUnlocked(profile.unlockedConcepts, "logbook");
  const collectionLabel = workshopUnlocked ? "your Workshop" : "your creations";
  const seeAllLabel = logbookUnlocked ? "Open Logbook" : "See all activities";

  // A creation is playable if it has a remembered preview (running or
  // restartable). Running previews are always playable too.
  const playable = new Set([...playableProjectIds, ...previews.map((p) => p.projectId)]);
  // The persistent bar offers Play for the most recent playable creation the
  // chat referred to, so it survives a restart even with no live server.
  const barPlayProjectId =
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" && message.projectId && playable.has(message.projectId),
      )?.projectId ??
    previews[0]?.projectId ??
    null;

  return (
    <main className="hb-workspace">
      <header className="hb-workspace-header">
        <div className="hb-project-title">
          <p className="t-pixel">Hi-Bit</p>
          <h1>Hi {profile.name} - what should we build?</h1>
          <p className="t-small">Tell Bit your idea. {providerStatus}</p>
        </div>
        <details className="hb-parent-menu hb-header-actions">
          <summary className="hb-button hb-button-secondary">Grown-up menu</summary>
          <div className="hb-card hb-parent-menu-popover">
            <ProfileSettingsMenu profile={profile} busy={busy} onUpdateProfile={onUpdateProfile} />
            <button className="hb-button hb-button-secondary" type="button" onClick={onOpenFolder}>
              Open creations folder
            </button>
            <button
              className="hb-button hb-button-secondary"
              type="button"
              onClick={onSwitchProfile}
            >
              Switch profile
            </button>
          </div>
        </details>
      </header>

      <section className="hb-chat-layout" data-preview={activePreview ? "open" : "closed"}>
        <div className="hb-chat-card">
          <MessageList
            messages={messages}
            thinking={thinking}
            thinkingReason={thinkingReason}
            playableProjectIds={playable}
            onPlay={onPlayPreview}
          />
          <ActivityChip
            activity={activity}
            running={running}
            playProjectId={barPlayProjectId}
            collectionLabel={collectionLabel}
            seeAllLabel={seeAllLabel}
            onPlay={onPlayPreview}
            onSeeAll={onShowActivity}
          />
          {error ? <p className="hb-error">{error}</p> : null}
          <Composer
            value={draft}
            running={running}
            onChange={onDraftChange}
            onSend={onSend}
            onAbort={onAbort}
          />
        </div>
        {activePreview ? (
          <PreviewPane
            preview={activePreview}
            reloadSignal={reloadSignal}
            onOpenExternal={onOpenPreviewExternal}
            onClose={onClosePreview}
          />
        ) : null}
      </section>

      {showActivity ? (
        <ActivityView
          activity={activity}
          logbookUnlocked={logbookUnlocked}
          onClose={onHideActivity}
        />
      ) : null}
    </main>
  );
}
