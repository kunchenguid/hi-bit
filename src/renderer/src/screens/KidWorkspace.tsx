import type { Profile } from "@shared/profile";
import { type JSX, useReducer } from "react";
import { CodeEditor } from "./CodeEditor";
import { DreamPicker } from "./DreamPicker";
import { KidChat } from "./KidChat";
import { KidProjects } from "./KidProjects";
import {
  INITIAL_KID_WORKSPACE_STATE,
  type KidWorkspaceEvent,
  type KidWorkspaceState,
  reduceKidWorkspace,
} from "./kidWorkspaceNavigation";
import { ParentGate } from "./ParentGate";
import { ParentHome } from "./ParentHome";

type Props = { profile: Profile };

function reducer(state: KidWorkspaceState, event: KidWorkspaceEvent): KidWorkspaceState {
  return reduceKidWorkspace(state, event);
}

export function KidWorkspace({ profile }: Props): JSX.Element {
  const [state, dispatch] = useReducer(reducer, INITIAL_KID_WORKSPACE_STATE);

  if (state.view === "parent") {
    return <ParentHome profile={profile} onLock={() => dispatch({ kind: "lock" })} />;
  }

  if (state.view === "parent-gate") {
    return (
      <ParentGate
        onUnlock={() => dispatch({ kind: "parent-unlock" })}
        onCancel={() => dispatch({ kind: "parent-cancel" })}
      />
    );
  }

  if (state.view === "picker") {
    return (
      <DreamPicker
        profile={profile}
        onCancel={() => dispatch({ kind: "picker-cancel" })}
        onPicked={() => dispatch({ kind: "picker-picked" })}
      />
    );
  }

  if (state.view === "projects") {
    return (
      <KidProjects
        profile={profile}
        onCancel={() => dispatch({ kind: "projects-cancel" })}
        onOpened={() => dispatch({ kind: "projects-opened" })}
      />
    );
  }

  if (state.view === "editor") {
    return (
      <CodeEditor
        profile={profile}
        onBackToChat={() => dispatch({ kind: "back-to-chat" })}
        onEnterParentMode={() => dispatch({ kind: "enter-parent-mode" })}
      />
    );
  }

  return (
    <KidChat
      profile={profile}
      onOpenEditor={() => dispatch({ kind: "open-editor" })}
      onEnterParentMode={() => dispatch({ kind: "enter-parent-mode" })}
      onSwitchDream={() => dispatch({ kind: "open-picker" })}
      onOpenProjects={() => dispatch({ kind: "open-projects" })}
    />
  );
}
