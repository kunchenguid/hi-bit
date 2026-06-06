import { describe, expect, it } from "vitest";
import { type AxNode, buildSnapshot, type FrameTree } from "./snapshot";

const node = (over: Partial<AxNode> & { nodeId: string }): AxNode => ({ ...over });

describe("buildSnapshot", () => {
  it("emits refs only for meaningful nodes with a backend node id", () => {
    const top: FrameTree = {
      frameKey: "top",
      url: "app://",
      nodes: [
        node({
          nodeId: "1",
          role: { value: "RootWebArea" },
          name: { value: "App" },
          childIds: ["2", "3"],
        }),
        node({
          nodeId: "2",
          role: { value: "button" },
          name: { value: "Play" },
          backendDOMNodeId: 100,
        }),
        node({ nodeId: "3", role: { value: "generic" }, childIds: ["4"] }),
        node({
          nodeId: "4",
          role: { value: "textbox" },
          name: { value: "composer" },
          backendDOMNodeId: 101,
        }),
      ],
    };
    const snap = buildSnapshot([top]);
    expect(snap.refs.get("e1")).toEqual({ frameKey: "top", backendDOMNodeId: 100 });
    expect(snap.refs.get("e2")).toEqual({ frameKey: "top", backendDOMNodeId: 101 });
    expect(snap.text).toContain('[e1] button "Play"');
    expect(snap.text).toContain('[e2] textbox "composer"');
    // The generic wrapper is skipped but its child is still reached.
    expect(snap.text).not.toContain("generic");
  });

  it("ignores nodes marked ignored", () => {
    const top: FrameTree = {
      frameKey: "top",
      url: "app://",
      nodes: [
        node({ nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] }),
        node({
          nodeId: "2",
          role: { value: "button" },
          name: { value: "Hidden" },
          ignored: true,
          backendDOMNodeId: 9,
        }),
      ],
    };
    const snap = buildSnapshot([top]);
    expect(snap.refs.size).toBe(0);
    expect(snap.text).not.toContain("Hidden");
  });

  it("headers each non-top frame and continues ref numbering across frames", () => {
    const top: FrameTree = {
      frameKey: "top",
      url: "app://",
      nodes: [
        node({ nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] }),
        node({
          nodeId: "2",
          role: { value: "button" },
          name: { value: "App btn" },
          backendDOMNodeId: 1,
        }),
      ],
    };
    const inner: FrameTree = {
      frameKey: "sess-abc",
      url: "http://127.0.0.1:5000/",
      nodes: [
        node({ nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] }),
        node({
          nodeId: "2",
          role: { value: "button" },
          name: { value: "Inner btn" },
          backendDOMNodeId: 7,
        }),
      ],
    };
    const snap = buildSnapshot([top, inner]);
    expect(snap.text).toContain("# frame: http://127.0.0.1:5000/");
    expect(snap.refs.get("e1")).toEqual({ frameKey: "top", backendDOMNodeId: 1 });
    expect(snap.refs.get("e2")).toEqual({ frameKey: "sess-abc", backendDOMNodeId: 7 });
  });

  it("includes element values (e.g. a filled input)", () => {
    const top: FrameTree = {
      frameKey: "top",
      url: "app://",
      nodes: [
        node({ nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] }),
        node({
          nodeId: "2",
          role: { value: "textbox" },
          name: { value: "Name" },
          value: { value: "Eddie" },
          backendDOMNodeId: 3,
        }),
      ],
    };
    const snap = buildSnapshot([top]);
    expect(snap.text).toContain("(value: Eddie)");
  });
});
