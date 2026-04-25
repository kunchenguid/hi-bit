import type { Profile } from "@shared/profile";
import { type JSX, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { KidChat } from "./KidChat";

type Props = {
  profile: Profile;
  onEnterParentMode: () => void;
  onSwitchDream: () => void;
  onOpenProjects: () => void;
};

export function KidBuildWorkspace({
  profile,
  onEnterParentMode,
  onSwitchDream,
  onOpenProjects,
}: Props): JSX.Element {
  const [editorRevealed, setEditorRevealed] = useState(false);

  if (!editorRevealed) {
    return (
      <KidChat
        profile={profile}
        onEnterParentMode={onEnterParentMode}
        onSwitchDream={onSwitchDream}
        onOpenProjects={onOpenProjects}
        onOpenEditor={() => setEditorRevealed(true)}
      />
    );
  }

  return (
    <main className="hb-build-shell">
      <section className="hb-build-editor" aria-label="Code workspace">
        <CodeEditor profile={profile} docked />
      </section>
      <aside className="hb-build-chat" aria-label="Chat with Bit">
        <KidChat
          profile={profile}
          onEnterParentMode={onEnterParentMode}
          onSwitchDream={onSwitchDream}
          onOpenProjects={onOpenProjects}
          docked
        />
      </aside>
    </main>
  );
}
