import { readFile } from "node:fs/promises";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { encodePng } from "./spriteImageIo";
import type { RgbaImage } from "./spriteProcessor";

/**
 * Bit's self-portrait, on demand.
 *
 * Hi-Bit's mascot and character is Bit: a pixel-art desktop-computer robot drawn
 * as a grid of solid-colour `<rect>` cells on a 16x16 viewBox
 * (`design/assets/mascot-boo.svg`). That SVG is the canonical art, but a vision
 * model can't rasterise SVG, so it could never actually "see" what it looks like.
 *
 * `renderMascotPng` paints the rect grid into a scaled-up PNG, and the `view_bit`
 * tool hands that PNG back as image content so Bit can answer "what do you look
 * like?" and bots can draw Bit on-model. We rasterise from the canonical SVG (no
 * committed binary) so the picture can never drift from the design system.
 */

/** Brand `--paper` (#F7F1E5): the app background, used as the opaque backdrop. */
const PAPER: readonly [number, number, number] = [0xf7, 0xf1, 0xe5];

/** How many output pixels per SVG grid cell. 16 cells * 24 = a 384px-square PNG. */
const DEFAULT_SCALE = 24;

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

/** Reads `viewBox="0 0 W H"`, falling back to the mascot's 16x16 grid. */
function parseGridSize(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox="\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*"/);
  if (!match) return { width: 16, height: 16 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Parses `#RGB`, `#RRGGBB`, or `#RRGGBBAA` into an RGBA tuple (alpha 0..1). */
function parseFill(fill: string): { r: number; g: number; b: number; a: number } | null {
  const hex = fill.trim().replace(/^#/, "");
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return { r, g, b, a: 1 };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  return null;
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

/** Pulls every `<rect>` cell out of the pixel-grid SVG. */
function parseRects(svg: string): Rect[] {
  const rects: Rect[] = [];
  for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
    const fill = attr(tag, "fill");
    if (!fill) continue;
    const colour = parseFill(fill);
    if (!colour) continue;
    const opacity = attr(tag, "opacity");
    const a = colour.a * (opacity !== undefined ? Number(opacity) : 1);
    rects.push({
      x: Number(attr(tag, "x") ?? 0),
      y: Number(attr(tag, "y") ?? 0),
      w: Number(attr(tag, "width") ?? 1),
      h: Number(attr(tag, "height") ?? 1),
      r: colour.r,
      g: colour.g,
      b: colour.b,
      a,
    });
  }
  return rects;
}

/**
 * Rasterises the mascot's pixel-grid SVG into a PNG buffer the vision model can
 * actually look at. Each cell is painted as a scaled block, source-over composited
 * onto the brand paper background so semi-transparent cells (e.g. the soft shadow)
 * blend correctly.
 */
export function renderMascotPng(svg: string, scale = DEFAULT_SCALE): Buffer {
  const grid = parseGridSize(svg);
  const width = Math.round(grid.width * scale);
  const height = Math.round(grid.height * scale);
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = PAPER[0];
    data[i * 4 + 1] = PAPER[1];
    data[i * 4 + 2] = PAPER[2];
    data[i * 4 + 3] = 255;
  }

  for (const rect of parseRects(svg)) {
    const x0 = Math.round(rect.x * scale);
    const y0 = Math.round(rect.y * scale);
    const x1 = Math.round((rect.x + rect.w) * scale);
    const y1 = Math.round((rect.y + rect.h) * scale);
    for (let py = Math.max(0, y0); py < Math.min(height, y1); py += 1) {
      for (let px = Math.max(0, x0); px < Math.min(width, x1); px += 1) {
        const idx = (py * width + px) * 4;
        data[idx] = Math.round(rect.r * rect.a + data[idx] * (1 - rect.a));
        data[idx + 1] = Math.round(rect.g * rect.a + data[idx + 1] * (1 - rect.a));
        data[idx + 2] = Math.round(rect.b * rect.a + data[idx + 2] * (1 - rect.a));
        data[idx + 3] = 255;
      }
    }
  }

  const image: RgbaImage = { width, height, data };
  return encodePng(image);
}

export type ViewBitToolDeps = {
  /** Absolute path to the canonical mascot SVG (`design/assets/mascot-boo.svg`). */
  mascotSvgPath: string;
  /** Injectable SVG loader for tests; defaults to reading `mascotSvgPath`. */
  readSvg?: (path: string) => Promise<string>;
};

/**
 * `view_bit`: hands the caller Bit's own mascot picture as a viewable PNG.
 *
 * Given to both Bit (so it can answer "what do you look like?") and bots (so any
 * "put Bit in my game" art stays on-model). The image lives in the model's
 * transcript; `stripImageData` swaps it for a placeholder in logbooks and
 * renderer events, the same as `search_image`.
 */
export function createViewBitTool(deps: ViewBitToolDeps): ToolDefinition {
  const readSvg = deps.readSvg ?? ((path: string) => readFile(path, "utf8"));
  // The mascot is a bundled asset that never changes while the app runs, so the
  // rendered PNG is deterministic: read and rasterise it once on first use, then
  // reuse the base64 for every later call. Lazy so an unused tool costs nothing.
  let cached: Promise<string> | undefined;
  const renderBase64 = (): Promise<string> => {
    cached ??= readSvg(deps.mascotSvgPath)
      .then((svg) => renderMascotPng(svg).toString("base64"))
      .catch((error) => {
        // Don't cache a transient failure - let the next call retry.
        cached = undefined;
        throw error;
      });
    return cached;
  };

  return defineTool({
    name: "view_bit",
    label: "Look at Bit",
    description:
      "Show Bit's own mascot picture so you can actually see what Bit looks like: the friendly pixel-art desktop-computer robot with a cream body, a glowing cyan screen for a face, a coral antenna, and a little green light. Call it when the builder asks what Bit looks like, or before drawing Bit or any Bit-branded art so it stays on-model. No input needed.",
    parameters: Type.Object({}),
    executionMode: "parallel",
    async execute() {
      const data = await renderBase64();
      return {
        content: [
          {
            type: "text",
            text: "This is Bit: a pixel-art desktop-computer robot - a cream-white body outlined in dark ink, a glowing cyan screen for a face with two eyes, a small coral antenna on top, and a little lime-green light.",
          },
          { type: "image", data, mimeType: "image/png" },
        ],
        details: { source: "brand_mascot" },
      };
    },
  });
}
