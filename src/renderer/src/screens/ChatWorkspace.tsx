import type { AuthStatus } from "@shared/auth";
import type { ChatMessage, CreationActivity } from "@shared/chat";
import type { ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import { ActivityChip } from "../components/ActivityChip";
import { ActivityView } from "../components/ActivityView";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";
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
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onOpenFolder: () => void;
  onSwitchProfile: () => void;
  onUpdateProfile: (settings: ProfileSettingsInput) => Promise<void>;
  onShowActivity: () => void;
  onHideActivity: () => void;
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
  onDraftChange,
  onSend,
  onAbort,
  onOpenFolder,
  onSwitchProfile,
  onUpdateProfile,
  onShowActivity,
  onHideActivity,
}: ChatWorkspaceProps) {
  const providerStatus = authStatus?.accountId
    ? `Codex provider connected (${authStatus.accountId})`
    : "Codex provider connected";

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

      <section className="hb-chat-layout">
        <div className="hb-chat-card">
          <MessageList messages={messages} />
          <ActivityChip activity={activity} onSeeAll={onShowActivity} />
          {error ? <p className="hb-error">{error}</p> : null}
          <Composer
            value={draft}
            running={running}
            onChange={onDraftChange}
            onSend={onSend}
            onAbort={onAbort}
          />
        </div>
      </section>

      {showActivity ? <ActivityView activity={activity} onClose={onHideActivity} /> : null}
    </main>
  );
}
