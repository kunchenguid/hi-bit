import { describe, expect, it } from "vitest";
import {
  type BBox,
  chromaKeyMagenta,
  createImage,
  cropImage,
  getBBox,
  magentaDistance,
  processSheet,
  type RgbaImage,
  resizeBilinear,
  splitCells,
} from "./spriteProcessor";

const MAGENTA: [number, number, number, number] = [255, 0, 255, 255];

function setPixel(
  img: RgbaImage,
  x: number,
  y: number,
  rgba: [number, number, number, number],
): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = rgba[0];
  img.data[i + 1] = rgba[1];
  img.data[i + 2] = rgba[2];
  img.data[i + 3] = rgba[3];
}

function fill(img: RgbaImage, rgba: [number, number, number, number]): void {
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) setPixel(img, x, y, rgba);
  }
}

function alphaAt(img: RgbaImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

/** A sheet on a magenta background with one solid opaque block centered in each cell. */
function makeBlockSheet(
  rows: number,
  cols: number,
  cellW: number,
  cellH: number,
  block: { w: number; h: number; color?: [number, number, number, number]; touchEdgeCell?: number },
): RgbaImage {
  const img = createImage(cols * cellW, rows * cellH);
  fill(img, MAGENTA);
  const color = block.color ?? [10, 120, 200, 255];
  let cell = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const touch = block.touchEdgeCell === cell;
      const offX = c * cellW + (touch ? 0 : Math.floor((cellW - block.w) / 2));
      const offY = r * cellH + (touch ? 0 : Math.floor((cellH - block.h) / 2));
      for (let y = 0; y < block.h; y += 1) {
        for (let x = 0; x < block.w; x += 1) setPixel(img, offX + x, offY + y, color);
      }
      cell += 1;
    }
  }
  return img;
}

describe("magentaDistance", () => {
  it("is zero for pure magenta and large for opaque non-magenta", () => {
    expect(magentaDistance(255, 0, 255)).toBe(0);
    expect(magentaDistance(0, 200, 0)).toBeGreaterThan(200);
  });
});

describe("chromaKeyMagenta", () => {
  it("clears a magenta background while keeping the subject opaque", () => {
    const img = makeBlockSheet(1, 1, 16, 16, { w: 6, h: 6 });
    const out = chromaKeyMagenta(img);
    // corners are background -> transparent
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, 15, 15)).toBe(0);
    // center is the subject -> opaque
    expect(alphaAt(out, 8, 8)).toBe(255);
  });

  it("does not mutate the input image", () => {
    const img = makeBlockSheet(1, 1, 8, 8, { w: 4, h: 4 });
    const before = img.data[3];
    chromaKeyMagenta(img);
    expect(img.data[3]).toBe(before);
  });

  it("clears transparent pixel colors", () => {
    const img = createImage(2, 1);
    setPixel(img, 0, 0, MAGENTA);
    setPixel(img, 1, 0, [10, 120, 200, 255]);

    const out = chromaKeyMagenta(img);

    expect(Array.from(out.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([10, 120, 200, 255]);
  });
});

describe("getBBox / cropImage", () => {
  it("finds the opaque bounds and crops to them", () => {
    const img = createImage(10, 10);
    setPixel(img, 3, 4, [0, 0, 0, 255]);
    setPixel(img, 6, 7, [0, 0, 0, 255]);
    const bbox = getBBox(img) as BBox;
    expect(bbox).toEqual([3, 4, 7, 8]);
    const cropped = cropImage(img, bbox);
    expect(cropped.width).toBe(4);
    expect(cropped.height).toBe(4);
    expect(alphaAt(cropped, 0, 0)).toBe(255);
  });

  it("returns null when nothing is opaque", () => {
    expect(getBBox(createImage(4, 4))).toBeNull();
  });
});

describe("resizeBilinear", () => {
  it("produces the requested dimensions and keeps opaque content opaque", () => {
    const img = createImage(4, 4);
    fill(img, [10, 20, 30, 255]);
    const out = resizeBilinear(img, 8, 8);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(alphaAt(out, 4, 4)).toBe(255);
  });

  it("clamps upscaled edge samples instead of extrapolating past the image", () => {
    const img = createImage(2, 2);
    img.data.set([10, 0, 0, 255], 0);
    img.data.set([20, 0, 0, 255], 4);
    img.data.set([30, 0, 0, 255], 8);
    img.data.set([40, 0, 0, 255], 12);

    const out = resizeBilinear(img, 4, 4);

    expect(out.data[0]).toBe(10);
    expect(out.data[3]).toBe(255);
  });
});

describe("splitCells", () => {
  it("cuts an image into rows x cols equal cells", () => {
    const img = createImage(20, 10);
    const cells = splitCells(img, 1, 2);
    expect(cells).toHaveLength(2);
    expect(cells[0].width).toBe(10);
    expect(cells[0].height).toBe(10);
  });
});

describe("processSheet", () => {
  it("produces one transparent frame per cell with a composed sheet (fit)", () => {
    const sheet = makeBlockSheet(2, 2, 32, 32, { w: 12, h: 12 });
    const result = processSheet(sheet, { rows: 2, cols: 2, cellSize: 48, scaleStrategy: "fit" });

    expect(result.frames).toHaveLength(4);
    expect(result.frames[0].width).toBe(48);
    expect(result.frames[0].height).toBe(48);
    expect(result.sheet.width).toBe(96);
    expect(result.sheet.height).toBe(96);
    // each frame has visible content and a transparent border
    expect(getBBox(result.frames[0])).not.toBeNull();
    expect(alphaAt(result.frames[0], 0, 0)).toBe(0);
    // clean, centered blocks of equal size do not touch cell edges
    expect(result.edgeTouchFrames).toEqual([]);
  });

  it("flags frames whose subject touches the cell edge", () => {
    // cell 1 (top-right) gets a block jammed into the corner
    const sheet = makeBlockSheet(2, 2, 32, 32, { w: 12, h: 12, touchEdgeCell: 1 });
    const result = processSheet(sheet, { rows: 2, cols: 2, cellSize: 48, scaleStrategy: "fit" });
    expect(result.edgeTouchFrames).toContain(1);
  });

  it("keeps subject scale stable across frames and reports low drift (preserve + feet)", () => {
    const sheet = makeBlockSheet(1, 2, 40, 40, { w: 10, h: 20 });
    const result = processSheet(sheet, {
      rows: 1,
      cols: 2,
      cellSize: 64,
      scaleStrategy: "preserve",
      align: "feet",
    });
    expect(result.frames).toHaveLength(2);
    expect(result.scaleDrift).toBeLessThan(0.05);
    // feet alignment: subject sits in the lower half of the cell
    const bbox = getBBox(result.frames[0]) as BBox;
    expect(bbox[3]).toBeGreaterThan(result.cellSize / 2);
  });

  it("reports meaningful drift when subject heights differ a lot (preserve)", () => {
    const sheet = createImage(80, 40);
    fill(sheet, MAGENTA);
    // left cell: short block; right cell: tall block, both centered-ish
    const color: [number, number, number, number] = [0, 0, 0, 255];
    for (let y = 18; y < 24; y += 1) for (let x = 17; x < 23; x += 1) setPixel(sheet, x, y, color);
    for (let y = 6; y < 34; y += 1) for (let x = 57; x < 63; x += 1) setPixel(sheet, x, y, color);
    const result = processSheet(sheet, {
      rows: 1,
      cols: 2,
      cellSize: 64,
      scaleStrategy: "preserve",
      align: "feet",
    });
    expect(result.scaleDrift).toBeGreaterThan(0.3);
  });
});
