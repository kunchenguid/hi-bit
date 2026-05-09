import type { Profile } from "@shared/profile";
import { type JSX, useEffect, useState } from "react";
import { useAppModeStore } from "../state/appModeStore";
import { DreamPicker } from "./DreamPicker";
import { KidBuildWorkspace } from "./KidBuildWorkspace";
import { KidChat } from "./KidChat";
import { KidProjects } from "./KidProjects";
import { KidShell, type KidShellView } from "./KidShell";

type Props = { profile: Profile };

export function KidWorkspace({ profile }: Props): JSX.Element {
  const enterParent = useAppModeStore((s) => s.enterParent);
  const initial: KidShellView = profile.currentDreamId ? "home" : "picker";
  const [view, setView] = useState<KidShellView>(initial);

  useEffect(() => {
    if (!profile.currentDreamId && view === "home") {
      setView("picker");
    }
  }, [profile.currentDreamId, view]);

  const effectiveView: KidShellView = !profile.currentDreamId && view === "home" ? "picker" : view;

  let body: JSX.Element;
  if (effectiveView === "picker") {
    body = <DreamPicker profile={profile} onPicked={() => setView("home")} />;
  } else if (effectiveView === "projects") {
    body = <KidProjects profile={profile} onOpened={() => setView("home")} />;
  } else if (profile.currentDreamId) {
    body = <KidBuildWorkspace profile={profile} />;
  } else {
    body = <KidChat profile={profile} />;
  }

  return (
    <KidShell current={effectiveView} onNavigate={setView} onEnterParentMode={enterParent}>
      {body}
    </KidShell>
  );
}
