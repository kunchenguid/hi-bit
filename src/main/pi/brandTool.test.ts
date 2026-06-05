import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createViewBitTool, renderMascotPng } from "./brandTool";
import { decodePng } from "./spriteImageIo";

const MASCOT_SVG_PATH = resolve("design/assets/mascot-boo.svg");
const MASCOT_SVG = readFileSync(MASCOT_SVG_PATH, "utf8");

/** Pulls the RGB triple of the pixel at (x,y) out of a decoded RGBA image. */
function pixelAt(
  img: { width: number; data: Uint8Array },
  x: number,
  y: number,
): [number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2]];
}

function hasColor(
  img: { width: number; height: number; data: Uint8Array },
  rgb: [number, number, number],
): boolean {
  for (let i = 0; i < img.width * img.height; i += 1) {
    if (
      img.data[i * 4] === rgb[0] &&
      img.data[i * 4 + 1] === rgb[1] &&
      img.data[i * 4 + 2] === rgb[2]
    ) {
      return true;
    }
  }
  return false;
}

describe("renderMascotPng", () => {
  it("rasterizes the 16x16 pixel-grid mascot SVG into a real PNG", () => {
    const png = renderMascotPng(MASCOT_SVG);
    // PNG magic number, so the model gets a genuine raster it can see.
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const decoded = decodePng(png);
    // 16-unit grid scaled up so the vision model sees crisp, legible pixels.
    expect(decoded.width).toBe(decoded.height);
    expect(decoded.width).toBeGreaterThanOrEqual(16 * 8);
  });

  it("paints the mascot's cyan screen-face and leaves the corner on brand paper", () => {
    const decoded = renderMascotPngDecoded();
    // The cyan screen (#2EC4F1) is Bit's defining feature; it must survive raster.
    expect(hasColor(decoded, [0x2e, 0xc4, 0xf1])).toBe(true);
    // The cream body highlight is present too.
    expect(hasColor(decoded, [0xff, 0xfd, 0xf5])).toBe(true);
    // The empty top-left corner falls back to the brand paper background, opaque.
    expect(pixelAt(decoded, 0, 0)).toEqual([0xf7, 0xf1, 0xe5]);
  });

  function renderMascotPngDecoded() {
    return decodePng(renderMascotPng(MASCOT_SVG));
  }
});

describe("createViewBitTool", () => {
  it("is the view_bit tool with a description that points at Bit's own look", () => {
    const tool = createViewBitTool({ mascotSvgPath: MASCOT_SVG_PATH });
    expect(tool.name).toBe("view_bit");
    expect(tool.description).toMatch(/Bit/);
    expect(tool.description).toMatch(/look|see|picture|mascot/i);
  });

  it("returns a text note plus a viewable PNG of Bit when called", async () => {
    const tool = createViewBitTool({ mascotSvgPath: MASCOT_SVG_PATH });
    const result = (await tool.execute("call-1", {}, undefined, undefined, {
      cwd: "/tmp",
    } as unknown as Parameters<typeof tool.execute>[4])) as {
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    };

    const text = result.content.find((part) => part.type === "text");
    const image = result.content.find((part) => part.type === "image");
    expect(text?.text).toMatch(/Bit/);
    expect(image?.mimeType).toBe("image/png");
    expect(typeof image?.data).toBe("string");
    expect((image?.data ?? "").length).toBeGreaterThan(0);
    // The base64 payload decodes back to a valid PNG.
    expect(
      Buffer.from(image?.data ?? "", "base64")
        .subarray(0, 8)
        .toString("hex"),
    ).toBe("89504e470d0a1a0a");
  });

  function callTool(tool: ReturnType<typeof createViewBitTool>) {
    return tool.execute("call", {}, undefined, undefined, {
      cwd: "/tmp",
    } as unknown as Parameters<typeof tool.execute>[4]);
  }

  it("rasterises once and reuses the result across calls", async () => {
    let reads = 0;
    const tool = createViewBitTool({
      mascotSvgPath: MASCOT_SVG_PATH,
      readSvg: async () => {
        reads += 1;
        return MASCOT_SVG;
      },
    });

    const [first, second] = (await Promise.all([callTool(tool), callTool(tool)])) as Array<{
      content: Array<{ type: string; data?: string }>;
    }>;

    // The bundled mascot never changes at runtime, so it is read and rendered once.
    expect(reads).toBe(1);
    const firstImage = first.content.find((part) => part.type === "image")?.data;
    const secondImage = second.content.find((part) => part.type === "image")?.data;
    expect(firstImage).toBe(secondImage);
  });

  it("does not cache a failed load, so a later call can retry", async () => {
    let reads = 0;
    const tool = createViewBitTool({
      mascotSvgPath: MASCOT_SVG_PATH,
      readSvg: async () => {
        reads += 1;
        if (reads === 1) throw new Error("transient");
        return MASCOT_SVG;
      },
    });

    await expect(callTool(tool)).rejects.toThrow("transient");
    await expect(callTool(tool)).resolves.toBeDefined();
    expect(reads).toBe(2);
  });
});
