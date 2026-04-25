import { describe, expect, it } from "vitest";
import {
  INITIAL_KID_WORKSPACE_STATE,
  type KidWorkspaceEvent,
  type KidWorkspaceState,
  reduceKidWorkspace,
} from "./kidWorkspaceNavigation";

describe("reduceKidWorkspace", () => {
  it("initial state is chat/chat", () => {
    expect(INITIAL_KID_WORKSPACE_STATE).toEqual({ view: "chat", kidView: "chat" });
  });

  it("open-editor moves view and kidView to editor", () => {
    const next = reduceKidWorkspace(INITIAL_KID_WORKSPACE_STATE, { kind: "open-editor" });
    expect(next).toEqual({ view: "editor", kidView: "editor" });
  });

  it("back-to-chat resets both view and kidView to chat", () => {
    const editorState: KidWorkspaceState = { view: "editor", kidView: "editor" };
    expect(reduceKidWorkspace(editorState, { kind: "back-to-chat" })).toEqual({
      view: "chat",
      kidView: "chat",
    });
  });

  it("open-picker flips view to picker without touching kidView", () => {
    const fromEditor: KidWorkspaceState = { view: "editor", kidView: "editor" };
    expect(reduceKidWorkspace(fromEditor, { kind: "open-picker" })).toEqual({
      view: "picker",
      kidView: "editor",
    });
    const fromChat: KidWorkspaceState = { view: "chat", kidView: "chat" };
    expect(reduceKidWorkspace(fromChat, { kind: "open-picker" })).toEqual({
      view: "picker",
      kidView: "chat",
    });
  });

  it("picker-cancel returns view to the kidView it came from", () => {
    const fromEditor: KidWorkspaceState = { view: "picker", kidView: "editor" };
    expect(reduceKidWorkspace(fromEditor, { kind: "picker-cancel" })).toEqual({
      view: "editor",
      kidView: "editor",
    });
  });

  it("picker-picked returns view to the kidView it came from", () => {
    const fromChat: KidWorkspaceState = { view: "picker", kidView: "chat" };
    expect(reduceKidWorkspace(fromChat, { kind: "picker-picked" })).toEqual({
      view: "chat",
      kidView: "chat",
    });
    const fromEditor: KidWorkspaceState = { view: "picker", kidView: "editor" };
    expect(reduceKidWorkspace(fromEditor, { kind: "picker-picked" })).toEqual({
      view: "editor",
      kidView: "editor",
    });
  });

  it("enter-parent-mode flips view to parent-gate", () => {
    const fromEditor: KidWorkspaceState = { view: "editor", kidView: "editor" };
    expect(reduceKidWorkspace(fromEditor, { kind: "enter-parent-mode" })).toEqual({
      view: "parent-gate",
      kidView: "editor",
    });
  });

  it("parent-unlock flips view to parent and preserves kidView", () => {
    const fromGate: KidWorkspaceState = { view: "parent-gate", kidView: "editor" };
    expect(reduceKidWorkspace(fromGate, { kind: "parent-unlock" })).toEqual({
      view: "parent",
      kidView: "editor",
    });
  });

  it("parent-cancel returns view to the kidView", () => {
    const fromGate: KidWorkspaceState = { view: "parent-gate", kidView: "chat" };
    expect(reduceKidWorkspace(fromGate, { kind: "parent-cancel" })).toEqual({
      view: "chat",
      kidView: "chat",
    });
  });

  it("lock returns from parent view to the kidView", () => {
    const fromParent: KidWorkspaceState = { view: "parent", kidView: "editor" };
    expect(reduceKidWorkspace(fromParent, { kind: "lock" })).toEqual({
      view: "editor",
      kidView: "editor",
    });
  });

  it("open-projects flips view to projects without touching kidView", () => {
    const fromChat: KidWorkspaceState = { view: "chat", kidView: "chat" };
    expect(reduceKidWorkspace(fromChat, { kind: "open-projects" })).toEqual({
      view: "projects",
      kidView: "chat",
    });
    const fromEditor: KidWorkspaceState = { view: "editor", kidView: "editor" };
    expect(reduceKidWorkspace(fromEditor, { kind: "open-projects" })).toEqual({
      view: "projects",
      kidView: "editor",
    });
  });

  it("projects-cancel returns view to the kidView it came from", () => {
    const fromEditor: KidWorkspaceState = { view: "projects", kidView: "editor" };
    expect(reduceKidWorkspace(fromEditor, { kind: "projects-cancel" })).toEqual({
      view: "editor",
      kidView: "editor",
    });
    const fromChat: KidWorkspaceState = { view: "projects", kidView: "chat" };
    expect(reduceKidWorkspace(fromChat, { kind: "projects-cancel" })).toEqual({
      view: "chat",
      kidView: "chat",
    });
  });

  it("projects-opened routes to the editor and pins kidView to editor", () => {
    const fromProjects: KidWorkspaceState = { view: "projects", kidView: "chat" };
    expect(reduceKidWorkspace(fromProjects, { kind: "projects-opened" })).toEqual({
      view: "editor",
      kidView: "editor",
    });
  });

  it("parent-unlock is the sole event that reaches view:parent (single-gate contract)", () => {
    const allEvents: KidWorkspaceEvent[] = [
      { kind: "open-editor" },
      { kind: "back-to-chat" },
      { kind: "open-picker" },
      { kind: "picker-cancel" },
      { kind: "picker-picked" },
      { kind: "open-projects" },
      { kind: "projects-cancel" },
      { kind: "projects-opened" },
      { kind: "enter-parent-mode" },
      { kind: "parent-unlock" },
      { kind: "parent-cancel" },
      { kind: "lock" },
    ];
    const startStates: KidWorkspaceState[] = [
      { view: "chat", kidView: "chat" },
      { view: "editor", kidView: "editor" },
      { view: "picker", kidView: "chat" },
      { view: "picker", kidView: "editor" },
      { view: "projects", kidView: "chat" },
      { view: "projects", kidView: "editor" },
      { view: "parent-gate", kidView: "chat" },
      { view: "parent-gate", kidView: "editor" },
      { view: "parent", kidView: "chat" },
      { view: "parent", kidView: "editor" },
    ];
    const entries: { kind: KidWorkspaceEvent["kind"]; from: KidWorkspaceState["view"] }[] = [];
    for (const start of startStates) {
      for (const event of allEvents) {
        const next = reduceKidWorkspace(start, event);
        if (next.view === "parent") {
          entries.push({ kind: event.kind, from: start.view });
        }
      }
    }
    const gatingKinds = new Set(entries.filter((e) => e.from !== "parent").map((e) => e.kind));
    expect(Array.from(gatingKinds)).toEqual(["parent-unlock"]);
  });
});
