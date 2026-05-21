import type { AuthStatus } from "@shared/auth";
import type { ChatMessage, ToolActivity } from "@shared/chat";
import type { ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";
import { ToolActivity as ToolActivityList } from "../components/ToolActivity";

type ChatWorkspaceProps = {
  authStatus: AuthStatus | null;
  profile: ProfileSummary;
  project: ProjectSummary;
  messages: ChatMessage[];
  tools: ToolActivity[];
  draft: string;
  running: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onBack: () => void;
  onOpenFolder: () => void;
  onLogout: () => void;
  onSwitchProfile: () => void;
};

export function ChatWorkspace({
  authStatus,
  profile,
  project,
  messages,
  tools,
  draft,
  running,
  error,
  onDraftChange,
  onSend,
  onAbort,
  onBack,
  onOpenFolder,
  onLogout,
  onSwitchProfile,
}: ChatWorkspaceProps) {
  return (
    <main className="hb-workspace">
      <header className="hb-workspace-header">
        <button className="hb-button hb-button-secondary" type="button" onClick={onBack}>
          Projects
        </button>
        <div className="hb-project-title">
          <p className="t-pixel">openai-codex/gpt-5.5</p>
          <h1>{project.title}</h1>
          <p className="t-small">
            {profile.name}'s project -{" "}
            {authStatus?.accountId ? `signed in as ${authStatus.accountId}` : "Codex connected"}
          </p>
        </div>
        <div className="hb-header-actions">
          <button className="hb-button hb-button-secondary" type="button" onClick={onSwitchProfile}>
            Switch profile
          </button>
          <button className="hb-button hb-button-secondary" type="button" onClick={onOpenFolder}>
            Open folder
          </button>
          <button className="hb-button hb-button-secondary" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="hb-chat-layout">
        <div className="hb-chat-card">
          <MessageList messages={messages} />
          {error ? <p className="hb-error">{error}</p> : null}
          <Composer
            value={draft}
            running={running}
            onChange={onDraftChange}
            onSend={onSend}
            onAbort={onAbort}
          />
        </div>
        <ToolActivityList tools={tools} />
      </section>
    </main>
  );
}
