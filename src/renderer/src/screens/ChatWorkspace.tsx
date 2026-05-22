import type { ChatMessage, ToolActivity } from "@shared/chat";
import type { ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";
import { ToolActivity as ToolActivityList } from "../components/ToolActivity";

type ChatWorkspaceProps = {
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
  onSwitchProfile: () => void;
};

export function ChatWorkspace({
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
  onSwitchProfile,
}: ChatWorkspaceProps) {
  const hasToolActivity = tools.length > 0;

  return (
    <main className="hb-workspace">
      <header className="hb-workspace-header">
        <button className="hb-button hb-button-secondary" type="button" onClick={onBack}>
          Projects
        </button>
        <div className="hb-project-title">
          <p className="t-pixel">{running ? "Bit is building" : "Bit is ready"}</p>
          <h1>{project.title}</h1>
          <p className="t-small">{profile.name} is building with Bit</p>
        </div>
        <div className="hb-header-actions">
          <button className="hb-button hb-button-secondary" type="button" onClick={onSwitchProfile}>
            Switch profile
          </button>
          <button className="hb-button hb-button-secondary" type="button" onClick={onOpenFolder}>
            Open folder
          </button>
        </div>
      </header>

      <section className={`hb-chat-layout${hasToolActivity ? "" : " hb-chat-layout-full"}`}>
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
        {hasToolActivity ? <ToolActivityList tools={tools} /> : null}
      </section>
    </main>
  );
}
