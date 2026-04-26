export type KidWorkspaceView = "main" | "picker" | "projects" | "parent-gate" | "parent";

export type KidWorkspaceState = {
  view: KidWorkspaceView;
};

export type KidWorkspaceEvent =
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
  view: "main",
};

export function reduceKidWorkspace(
  _state: KidWorkspaceState,
  event: KidWorkspaceEvent,
): KidWorkspaceState {
  switch (event.kind) {
    case "open-picker":
      return { view: "picker" };
    case "picker-cancel":
    case "picker-picked":
      return { view: "main" };
    case "open-projects":
      return { view: "projects" };
    case "projects-cancel":
    case "projects-opened":
      return { view: "main" };
    case "enter-parent-mode":
      return { view: "parent-gate" };
    case "parent-unlock":
      return { view: "parent" };
    case "parent-cancel":
    case "lock":
      return { view: "main" };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
