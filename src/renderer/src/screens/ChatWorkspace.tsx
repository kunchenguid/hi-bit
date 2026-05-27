import type { AuthStatus } from "@shared/auth";
import type { ChatMessage, CreationActivity, PreviewInfo } from "@shared/chat";
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
  busy: boolean;
  error: string | null;
  previews: PreviewInfo[];
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
  busy,
  error,
  previews,
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
  // token (and any tool-only stretches). Once an assistant bubble exists, its
  // streaming text is the liveness cue and the dots step aside.
  const thinking = running && messages.at(-1)?.role !== "assistant";

  const livePreviewProjectIds = new Set(previews.map((preview) => preview.projectId));
  // The persistent bar offers Play for the most recent live preview.
  const barPreview = previews[0] ?? null;

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
            livePreviewProjectIds={livePreviewProjectIds}
            onPlay={onPlayPreview}
          />
          <ActivityChip
            activity={activity}
            running={running}
            preview={barPreview}
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

      {showActivity ? <ActivityView activity={activity} onClose={onHideActivity} /> : null}
    </main>
  );
}
