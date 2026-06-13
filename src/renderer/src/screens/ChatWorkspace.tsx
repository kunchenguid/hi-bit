import type { BrowserState } from "@shared/browser";
import type {
  ChatMessage,
  CreationActivity,
  OutgoingImage,
  PreviewInfo,
  TurnKind,
} from "@shared/chat";
import type { ThinkingSpeed } from "@shared/config";
import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { useState } from "react";
import { ActivityChip } from "../components/ActivityChip";
import { BrowserPane } from "../components/BrowserPane";
import { Composer } from "../components/Composer";
import { FactoryHandbook } from "../components/FactoryHandbook";
import { FactoryView } from "../components/FactoryView";
import { Icon } from "../components/Icon";
import { MessageList } from "../components/MessageList";
import { ProgressOverlay } from "../components/ProgressOverlay";
import { SettingsOverlay } from "../components/SettingsOverlay";
import { useAppVersion } from "../components/useAppVersion";
import { useLearningProgress } from "../components/useLearningProgress";
import { useUpdateStatus } from "../components/useUpdateStatus";

type ChatWorkspaceProps = {
  profile: ProfileSummary;
  messages: ChatMessage[];
  activity: CreationActivity[];
  showActivity: boolean;
  draft: string;
  draftImage: OutgoingImage | null;
  voiceSupported: boolean;
  running: boolean;
  activeTurn: { id: string; kind: TurnKind } | null;
  busy: boolean;
  error: string | null;
  previews: PreviewInfo[];
  playableProjectIds: string[];
  creations: ProjectSummary[];
  browserState: BrowserState;
  reloadSignal: number;
  reloadProjectId: string | null;
  onDraftChange: (value: string) => void;
  onAttachImage: (image: OutgoingImage) => void;
  onClearImage: () => void;
  onVoiceText: (text: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onOpenFolder: () => void;
  onSwitchProfile: () => void;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
  onResetConversation: () => Promise<void>;
  thinkingSpeed: ThinkingSpeed;
  onChangeThinkingSpeed: (speed: ThinkingSpeed) => void;
  onShowActivity: () => void;
  onHideActivity: () => void;
  onPlayPreview: (projectId: string) => void;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onReportTabLoaded: (tabId: string, url: string, title?: string) => void;
  onOpenPreviewExternal: (url: string) => void;
  onClearPreviewCache: () => Promise<void>;
};

export function ChatWorkspace({
  profile,
  messages,
  activity,
  showActivity,
  draft,
  draftImage,
  voiceSupported,
  running,
  activeTurn,
  busy,
  error,
  previews,
  playableProjectIds,
  creations,
  browserState,
  reloadSignal,
  reloadProjectId,
  onDraftChange,
  onAttachImage,
  onClearImage,
  onVoiceText,
  onSend,
  onAbort,
  onOpenFolder,
  onSwitchProfile,
  onUpdateProfile,
  onResetConversation,
  thinkingSpeed,
  onChangeThinkingSpeed,
  onShowActivity,
  onHideActivity,
  onPlayPreview,
  onSwitchTab,
  onCloseTab,
  onReportTabLoaded,
  onOpenPreviewExternal,
  onClearPreviewCache,
}: ChatWorkspaceProps) {
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

  // Whether a newer Hi-Bit is out. Updating is a settings task, so the dot on
  // the Settings button is the only hint the kid sees in the main header.
  const updateStatus = useUpdateStatus();
  const appVersion = useAppVersion();
  const updateAvailable = updateStatus?.updateAvailable ?? false;
  const resetBlockedReason =
    running || activeTurn
      ? "Wait for Bit to finish before resetting the conversation."
      : activity.some((item) => item.status === "working")
        ? "Wait for the running build to finish before resetting the conversation."
        : null;

  // The builder's learning progress, fetched fresh each time they open their
  // Handbook or My progress.
  const { progress, refresh: refreshProgress } = useLearningProgress(profile.id);
  const [showHandbook, setShowHandbook] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const openHandbook = () => {
    refreshProgress();
    setShowHandbook(true);
  };
  const openProgress = () => {
    refreshProgress();
    setShowProgress(true);
  };

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
        <h1 className="hb-workspace-greeting">Hi {profile.name} - what should we build?</h1>
        <div className="hb-header-actions">
          <button className="hb-button hb-button-secondary" type="button" onClick={openHandbook}>
            <Icon name="i-hint" />
            What I can do
          </button>
          <button className="hb-button hb-button-secondary" type="button" onClick={openProgress}>
            <Icon name="i-trophy" />
            My progress
          </button>
          <button
            className="hb-button hb-button-secondary"
            type="button"
            onClick={() => setShowSettings(true)}
          >
            <Icon name="i-settings" />
            Settings
            {updateAvailable ? (
              <span className="hb-update-dot" role="img" aria-label="update available" />
            ) : null}
          </button>
        </div>
      </header>

      <section
        className="hb-chat-layout"
        data-preview={browserState.tabs.length > 0 ? "open" : "closed"}
      >
        <div className="hb-chat-card">
          <MessageList
            messages={messages}
            thinking={thinking}
            thinkingReason={thinkingReason}
            playableProjectIds={playable}
            onPlay={onPlayPreview}
            builderName={profile.name}
            onPickIdea={(text) => {
              // Fill the box but never send - pressing Send stays the kid's move.
              // Focus so they can tweak the starter sentence right away.
              onDraftChange(text);
              document.getElementById("hibit-composer")?.focus();
            }}
          />
          <ActivityChip
            activity={activity}
            running={running}
            playProjectId={barPlayProjectId}
            onPlay={onPlayPreview}
            creationCount={creations.length}
            onOpenFactory={onShowActivity}
          />
          {error ? <p className="hb-error">{error}</p> : null}
          <Composer
            value={draft}
            image={draftImage}
            voiceSupported={voiceSupported}
            running={running}
            onChange={onDraftChange}
            onAttachImage={onAttachImage}
            onClearImage={onClearImage}
            onVoiceText={onVoiceText}
            onSend={onSend}
            onAbort={onAbort}
          />
        </div>
        {browserState.tabs.length > 0 ? (
          <BrowserPane
            state={browserState}
            reloadSignal={reloadSignal}
            reloadProjectId={reloadProjectId}
            clearCache={onClearPreviewCache}
            onSwitchTab={onSwitchTab}
            onCloseTab={onCloseTab}
            onReportLoaded={onReportTabLoaded}
            onOpenExternal={onOpenPreviewExternal}
          />
        ) : null}
      </section>

      {showActivity ? (
        <FactoryView
          creations={creations}
          activity={activity}
          playableProjectIds={playable}
          onPlay={onPlayPreview}
          onClose={onHideActivity}
        />
      ) : null}

      {showHandbook ? (
        <FactoryHandbook
          builderName={profile.name}
          progress={progress}
          onClose={() => setShowHandbook(false)}
        />
      ) : null}

      {showProgress ? (
        <ProgressOverlay
          builderName={profile.name}
          progress={progress}
          onClose={() => setShowProgress(false)}
        />
      ) : null}

      {showSettings ? (
        <SettingsOverlay
          profile={profile}
          busy={busy}
          thinkingSpeed={thinkingSpeed}
          updateStatus={updateStatus}
          appVersion={updateStatus?.currentVersion ?? appVersion}
          resetBlockedReason={resetBlockedReason}
          onClose={() => setShowSettings(false)}
          onOpenFolder={onOpenFolder}
          onSwitchProfile={onSwitchProfile}
          onUpdateProfile={onUpdateProfile}
          onResetConversation={onResetConversation}
          onChangeThinkingSpeed={onChangeThinkingSpeed}
        />
      ) : null}
    </main>
  );
}
