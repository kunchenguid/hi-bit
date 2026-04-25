import { describe, expect, it } from "vitest";
import {
  INITIAL_KID_WORKSPACE_STATE,
  type KidWorkspaceEvent,
  type KidWorkspaceState,
  reduceKidWorkspace,
} from "./kidWorkspaceNavigation";

describe("reduceKidWorkspace", () => {
  it("initial state is main", () => {
    expect(INITIAL_KID_WORKSPACE_STATE).toEqual({ view: "main" });
  });

  it("open-picker flips view to picker", () => {
    expect(reduceKidWorkspace(INITIAL_KID_WORKSPACE_STATE, { kind: "open-picker" })).toEqual({
      view: "picker",
    });
  });

  it("picker-cancel returns to main", () => {
    const fromPicker: KidWorkspaceState = { view: "picker" };
    expect(reduceKidWorkspace(fromPicker, { kind: "picker-cancel" })).toEqual({ view: "main" });
  });

  it("picker-picked returns to main", () => {
    const fromPicker: KidWorkspaceState = { view: "picker" };
    expect(reduceKidWorkspace(fromPicker, { kind: "picker-picked" })).toEqual({ view: "main" });
  });

  it("open-projects flips view to projects", () => {
    expect(reduceKidWorkspace(INITIAL_KID_WORKSPACE_STATE, { kind: "open-projects" })).toEqual({
      view: "projects",
    });
  });

  it("projects-cancel returns to main", () => {
    const fromProjects: KidWorkspaceState = { view: "projects" };
    expect(reduceKidWorkspace(fromProjects, { kind: "projects-cancel" })).toEqual({ view: "main" });
  });

  it("projects-opened returns to main (workspace renders the editor when a dream is active)", () => {
    const fromProjects: KidWorkspaceState = { view: "projects" };
    expect(reduceKidWorkspace(fromProjects, { kind: "projects-opened" })).toEqual({
      view: "main",
    });
  });

  it("enter-parent-mode flips view to parent-gate", () => {
    expect(
      reduceKidWorkspace(INITIAL_KID_WORKSPACE_STATE, { kind: "enter-parent-mode" }),
    ).toEqual({ view: "parent-gate" });
  });

  it("parent-unlock flips view to parent", () => {
    const fromGate: KidWorkspaceState = { view: "parent-gate" };
    expect(reduceKidWorkspace(fromGate, { kind: "parent-unlock" })).toEqual({ view: "parent" });
  });

  it("parent-cancel returns to main", () => {
    const fromGate: KidWorkspaceState = { view: "parent-gate" };
    expect(reduceKidWorkspace(fromGate, { kind: "parent-cancel" })).toEqual({ view: "main" });
  });

  it("lock returns from parent view to main", () => {
    const fromParent: KidWorkspaceState = { view: "parent" };
    expect(reduceKidWorkspace(fromParent, { kind: "lock" })).toEqual({ view: "main" });
  });

  it("parent-unlock is the sole event that reaches view:parent (single-gate contract)", () => {
    const allEvents: KidWorkspaceEvent[] = [
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
      { view: "main" },
      { view: "picker" },
      { view: "projects" },
      { view: "parent-gate" },
      { view: "parent" },
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
