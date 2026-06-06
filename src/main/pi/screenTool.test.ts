import { describe, expect, it } from "vitest";
import { createViewScreenTool, planShorterEdgeResize } from "./screenTool";

function callTool(tool: ReturnType<typeof createViewScreenTool>) {
  return tool.execute("call", {}, undefined, undefined, {
    cwd: "/tmp",
  } as unknown as Parameters<typeof tool.execute>[4]) as Promise<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    details?: Record<string, unknown>;
  }>;
}

describe("planShorterEdgeResize", () => {
  it("does not resize when the shorter edge is already at or under the cap", () => {
    // A logical 1280x820 window at 1x: shorter edge 820 < 1024, leave it crisp.
    expect(planShorterEdgeResize({ width: 1280, height: 820 }, 1024)).toBeNull();
    // Exactly at the cap is still a no-op.
    expect(planShorterEdgeResize({ width: 2048, height: 1024 }, 1024)).toBeNull();
  });

  it("scales a landscape Retina capture so the shorter edge becomes the cap", () => {
    // 1280x820 logical at devicePixelRatio 2 -> 2560x1640 physical pixels.
    const plan = planShorterEdgeResize({ width: 2560, height: 1640 }, 1024);
    expect(plan?.height).toBe(1024);
    // Aspect ratio preserved: 2560 * (1024/1640) ≈ 1598.
    expect(plan?.width).toBe(1598);
  });

  it("scales a portrait capture so the shorter edge (width) becomes the cap", () => {
    const plan = planShorterEdgeResize({ width: 1200, height: 2400 }, 1024);
    expect(plan?.width).toBe(1024);
    expect(plan?.height).toBe(2048);
  });

  it("maps a square capture to a cap-by-cap square", () => {
    expect(planShorterEdgeResize({ width: 2048, height: 2048 }, 1024)).toEqual({
      width: 1024,
      height: 1024,
    });
  });
});

describe("createViewScreenTool", () => {
  it("is the view_screen tool with a description about what the builder sees", () => {
    const tool = createViewScreenTool({ capture: async () => "AAAA" });
    expect(tool.name).toBe("view_screen");
    expect(tool.description).toMatch(/screen|see|look/i);
    expect(tool.description).toMatch(/builder|kid|app/i);
  });

  it("returns a text note plus the captured PNG when a screenshot is available", async () => {
    const tool = createViewScreenTool({ capture: async () => "PNGBYTES" });

    const result = await callTool(tool);
    const text = result.content.find((part) => part.type === "text");
    const image = result.content.find((part) => part.type === "image");

    expect(text?.text).toBeTruthy();
    expect(image?.mimeType).toBe("image/png");
    expect(image?.data).toBe("PNGBYTES");
    expect(result.details?.source).toBe("app_screen");
  });

  it("falls back to a text-only result when no screen can be captured", async () => {
    const tool = createViewScreenTool({ capture: async () => null });

    const result = await callTool(tool);
    expect(result.content.some((part) => part.type === "image")).toBe(false);
    const text = result.content.find((part) => part.type === "text");
    expect(text?.text).toMatch(/can'?t|couldn'?t|no/i);
  });
});
