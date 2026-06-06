import { describe, expect, it, vi } from "vitest";
import { CdpController, type CdpDebugger } from "./cdpController";

/** A quad whose corners average to (cx, cy) with size 10x10. */
const quadAround = (cx: number, cy: number): number[] => [
  cx - 5,
  cy - 5,
  cx + 5,
  cy - 5,
  cx + 5,
  cy + 5,
  cx - 5,
  cy + 5,
];

/** A quad whose top-left is (x, y). */
const quadAt = (x: number, y: number): number[] => [x, y, x + 100, y, x + 100, y + 100, x, y + 100];

function makeFakeDebugger() {
  let messageHandler:
    | ((e: unknown, m: string, p: Record<string, unknown>, s?: string) => void)
    | undefined;
  const sent: Array<{ method: string; params: object; sessionId?: string }> = [];

  const sendCommand = vi.fn(
    async (
      method: string,
      params: object = {},
      sessionId?: string,
    ): Promise<Record<string, unknown>> => {
      sent.push({ method, params, sessionId });
      const p = params as Record<string, unknown>;
      if (method === "Page.getFrameTree") {
        const url =
          sessionId === "s1"
            ? "http://127.0.0.1:5000/"
            : sessionId === "s2"
              ? "https://wikipedia.org/"
              : "app://app";
        return { frameTree: { frame: { url } } };
      }
      if (method === "Accessibility.getFullAXTree") {
        if (sessionId === "s1") {
          return {
            nodes: [
              { nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] },
              {
                nodeId: "2",
                role: { value: "button" },
                name: { value: "Inner btn" },
                backendDOMNodeId: 20,
              },
            ],
          };
        }
        return {
          nodes: [
            { nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] },
            {
              nodeId: "2",
              role: { value: "button" },
              name: { value: "App btn" },
              backendDOMNodeId: 10,
            },
          ],
        };
      }
      if (method === "DOM.getFrameOwner" && p.frameId === "f1") {
        return { backendNodeId: 99 };
      }
      if (method === "DOM.getBoxModel") {
        if (p.backendNodeId === 20) return { model: { content: quadAround(50, 50) } }; // frame-local
        if (p.backendNodeId === 99) return { model: { content: quadAt(200, 100) } }; // iframe in top
        if (p.backendNodeId === 10) return { model: { content: quadAround(30, 30) } };
        return {};
      }
      return {};
    },
  );

  const dbg: CdpDebugger = {
    isAttached: () => false,
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand,
    on: ((event: string, listener: never) => {
      if (event === "message") messageHandler = listener as never;
    }) as CdpDebugger["on"],
  };

  return {
    dbg,
    sent,
    sendCommand,
    fireAttachedChild: () =>
      messageHandler?.(null, "Target.attachedToTarget", {
        sessionId: "s1",
        targetInfo: { targetId: "f1", type: "iframe" },
      }),
    fireAttachedSecondChild: () =>
      messageHandler?.(null, "Target.attachedToTarget", {
        sessionId: "s2",
        targetInfo: { targetId: "f2", type: "iframe" },
      }),
  };
}

describe("CdpController", () => {
  it("merges frames into a ref'd snapshot across the OOPIF boundary", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    fake.fireAttachedChild();

    const text = await controller.snapshot();
    expect(text).toContain('[e1] button "App btn"');
    expect(text).toContain("# frame: http://127.0.0.1:5000/");
    expect(text).toContain('[e2] button "Inner btn"');
  });

  it("resolves a cross-origin ref through the frame-offset chain", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    fake.fireAttachedChild();
    await controller.snapshot();

    // inner button center (50,50) + iframe top-left (200,100) = (250,150)
    const point = await controller.resolveCenter("e2");
    expect(point).toEqual({ x: 250, y: 150 });
  });

  it("clicks at the composed point on the top session", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    fake.fireAttachedChild();
    await controller.snapshot();
    await controller.click("e2");

    const presses = fake.sent.filter(
      (s) =>
        s.method === "Input.dispatchMouseEvent" &&
        (s.params as { type?: string }).type === "mousePressed",
    );
    expect(presses).toHaveLength(1);
    expect(presses[0].params).toMatchObject({ x: 250, y: 150 });
    expect(presses[0].sessionId).toBeUndefined(); // dispatched on the TOP session
  });

  it("reports the first attached frame URL rejected by a caller allowlist", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    fake.fireAttachedChild();

    await expect(controller.firstDisallowedFrameUrl((url) => url.includes("app://"))).resolves.toBe(
      "http://127.0.0.1:5000/",
    );
  });

  it("can validate only one browser frame and ignore the app frame", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    fake.fireAttachedChild();

    await expect(controller.firstDisallowedFrameUrl(() => false, "s1")).resolves.toBe(
      "http://127.0.0.1:5000/",
    );
  });

  it("snapshots only the requested active browser frame", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    fake.fireAttachedChild();
    fake.fireAttachedSecondChild();

    const text = await controller.snapshotFrame("s1");

    expect(text).toContain('button "Inner btn"');
    expect(text).not.toContain("app://app");
    expect(text).not.toContain("https://wikipedia.org/");
  });

  it("uses the platform select-all chord before replacing field text", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    await controller.snapshot();
    await controller.fill("e1", "new text");

    const keyDowns = fake.sent.filter(
      (s) =>
        s.method === "Input.dispatchKeyEvent" && (s.params as { type?: string }).type === "keyDown",
    );
    const selectAll = keyDowns.find((s) => (s.params as { key?: string }).key === "a");
    expect(selectAll?.params).toMatchObject({
      key: "a",
      modifiers: process.platform === "darwin" ? 4 : 2,
    });
  });

  it("rejects an unknown ref with a re-snapshot hint", async () => {
    const fake = makeFakeDebugger();
    const controller = new CdpController({ debugger: fake.dbg, capture: async () => "png" });
    await controller.attach();
    await expect(controller.resolveCenter("nope")).rejects.toThrow(/fresh snapshot/);
  });
});
