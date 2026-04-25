export type KidWorkspaceView = "chat" | "editor" | "picker" | "projects" | "parent-gate" | "parent";
export type KidMainView = "chat" | "editor";

export type KidWorkspaceState = {
  view: KidWorkspaceView;
  kidView: KidMainView;
};

export type KidWorkspaceEvent =
  | { kind: "open-editor" }
  | { kind: "back-to-chat" }
  | { kind: "open-picker" }
  | { kind: "picker-cancel" }
  | { kind: "picker-picked" }
  | { kind: "open-projects" }
  | { kind: "projects-cancel" }
  | { kind: "projects-opened" }
  | { kind: "enter-parent-mode" }
  | { kind: "parent-unlock" }
  | { kind: "parent-cancel" }
  | { kind: "lock" };

export const INITIAL_KID_WORKSPACE_STATE: KidWorkspaceState = {
  view: "chat",
  kidView: "chat",
};

export function reduceKidWorkspace(
  state: KidWorkspaceState,
  event: KidWorkspaceEvent,
): KidWorkspaceState {
  switch (event.kind) {
    case "open-editor":
      return { view: "editor", kidView: "editor" };
    case "back-to-chat":
      return { view: "chat", kidView: "chat" };
    case "open-picker":
      return { ...state, view: "picker" };
    case "picker-cancel":
    case "picker-picked":
      return { ...state, view: state.kidView };
    case "open-projects":
      return { ...state, view: "projects" };
    case "projects-cancel":
      return { ...state, view: state.kidView };
    case "projects-opened":
      return { view: "editor", kidView: "editor" };
    case "enter-parent-mode":
      return { ...state, view: "parent-gate" };
    case "parent-unlock":
      return { ...state, view: "parent" };
    case "parent-cancel":
    case "lock":
      return { ...state, view: state.kidView };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
