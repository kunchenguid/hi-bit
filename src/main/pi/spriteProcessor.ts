/**
 * Deterministic sprite-sheet processor (pure pixel logic, no I/O).
 *
 * The art model is asked to draw on a solid flat magenta (#FF00FF) background.
 * This module turns that raw sheet into game-ready frames: it keys out the
 * magenta, slices the grid, aligns and scales each frame, runs quality checks
 * (does a subject touch its cell edge? do subject sizes drift across frames?),
 * and composes a clean transparent sheet. PNG/GIF encoding lives in
 * `spriteImageIo.ts`; this file only operates on raw RGBA buffers so it stays
 * fully unit-testable.
 */

/** An RGBA bitmap. `data` is width*height*4 bytes, row-major, 8 bits per channel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Inclusive-exclusive bounds: [x0, y0, x1, y1]. */
export type BBox = [number, number, number, number];

export type Align = "center" | "feet";
export type ScaleStrategy = "fit" | "preserve";

export interface ProcessOptions {
  rows: number;
  cols: number;
  /** Output cell is a square of this many pixels. */
  cellSize: number;
  align?: Align;
  scaleStrategy?: ScaleStrategy;
  /** Fraction of the cell the subject fills under `fit` (and the feet padding under `preserve`). */
  fitScale?: number;
  /** Magenta-key thresholds; defaults match the AGF-derived processor. */
  threshold?: number;
  edgeThreshold?: number;
}

export interface FrameQc {
  index: number;
  row: number;
  col: number;
  /** Subject bounds within the raw (cleaned) cell, before scaling. */
  bbox: BBox | null;
  /** Subject pixel size [w, h] within the raw cell. */
  subjectSize: [number, number];
  /** True if the subject reaches a cell edge in the raw cell. */
  edgeTouch: boolean;
}

export interface ProcessResult {
  frames: RgbaImage[];
  sheet: RgbaImage;
  qc: FrameQc[];
  rows: number;
  cols: number;
  cellSize: number;
  /** Indices of frames whose subject touches a cell edge. */
  edgeTouchFrames: number[];
  /** (maxSubjectHeight - minSubjectHeight) / maxSubjectHeight across frames; 0 if < 2 subjects. */
  scaleDrift: number;
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function magentaDistance(r: number, g: number, b: number): number {
  return Math.sqrt((r - 255) ** 2 + g ** 2 + (b - 255) ** 2);
}

/**
 * Replace the magenta background with transparency. A first pass clears any
 * near-magenta pixel; a flood fill from the borders then clears the softer
 * antialiased halo while leaving interior magenta-ish detail untouched.
 */
export function chromaKeyMagenta(img: RgbaImage, threshold = 100, edgeThreshold = 150): RgbaImage {
  const { width, height } = img;
  const data = new Uint8Array(img.data);

  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    if (magentaDistance(data[i], data[i + 1], data[i + 2]) < threshold) data[i + 3] = 0;
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (!visited[p]) stack.push(p);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const p = stack.pop() as number;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    const x = p % width;
    const y = (p - x) / width;
    const transparent = data[i + 3] === 0;
    if (!transparent) {
      if (magentaDistance(data[i], data[i + 1], data[i + 2]) >= edgeThreshold) continue;
      data[i + 3] = 0;
    }
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return { width, height, data };
}

export function getBBox(img: RgbaImage): BBox | null {
  const { width, height, data } = img;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return [x0, y0, x1 + 1, y1 + 1];
}

export function cropImage(img: RgbaImage, bbox: BBox): RgbaImage {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0;
  const h = y1 - y0;
  const out = createImage(w, h);
  for (let y = 0; y < h; y += 1) {
    const srcStart = ((y + y0) * img.width + x0) * 4;
    out.data.set(img.data.subarray(srcStart, srcStart + w * 4), y * w * 4);
  }
  return out;
}

/** Bilinear resize over all four channels (alpha included). */
export function resizeBilinear(img: RgbaImage, newW: number, newH: number): RgbaImage {
  const out = createImage(newW, newH);
  if (newW === 0 || newH === 0 || img.width === 0 || img.height === 0) return out;
  const sx = img.width / newW;
  const sy = img.height / newH;
  for (let y = 0; y < newH; y += 1) {
    const fy = Math.max(0, Math.min(img.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < newW; x += 1) {
      const fx = Math.max(0, Math.min(img.width - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * newW + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c];
        const p10 = img.data[(y0 * img.width + x1) * 4 + c];
        const p01 = img.data[(y1 * img.width + x0) * 4 + c];
        const p11 = img.data[(y1 * img.width + x1) * 4 + c];
        const top = p00 + (p10 - p00) * wx;
        const bottom = p01 + (p11 - p01) * wx;
        out.data[o + c] = Math.round(top + (bottom - top) * wy);
      }
    }
  }
  return out;
}

/** Source-over composite of `src` onto `dst` at (px, py). */
export function pasteOnto(dst: RgbaImage, src: RgbaImage, px: number, py: number): void {
  for (let y = 0; y < src.height; y += 1) {
    const dy = py + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x += 1) {
      const dx = px + x;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const sa = src.data[si + 3];
      if (sa === 0) continue;
      const di = (dy * dst.width + dx) * 4;
      if (sa === 255 || dst.data[di + 3] === 0) {
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = sa;
        continue;
      }
      const a = sa / 255;
      const ia = 1 - a;
      dst.data[di] = Math.round(src.data[si] * a + dst.data[di] * ia);
      dst.data[di + 1] = Math.round(src.data[si + 1] * a + dst.data[di + 1] * ia);
      dst.data[di + 2] = Math.round(src.data[si + 2] * a + dst.data[di + 2] * ia);
      dst.data[di + 3] = Math.max(sa, dst.data[di + 3]);
    }
  }
}

/** Cut into rows*cols equal cells (row-major). Trailing pixels from rounding are dropped. */
export function splitCells(img: RgbaImage, rows: number, cols: number): RgbaImage[] {
  const cellW = Math.floor(img.width / cols);
  const cellH = Math.floor(img.height / rows);
  const cells: RgbaImage[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push(cropImage(img, [c * cellW, r * cellH, c * cellW + cellW, r * cellH + cellH]));
    }
  }
  return cells;
}

function bboxTouchesEdge(bbox: BBox, width: number, height: number): boolean {
  return bbox[0] <= 0 || bbox[1] <= 0 || bbox[2] >= width || bbox[3] >= height;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The full pipeline: chroma-key, slice, align/scale per frame, QC, compose.
 *
 * `fit` crops each subject to its bbox and scales it into the output cell -
 * best for icons, projectiles, and FX where uniform cell-fill matters.
 * `preserve` keeps the subject at its raw in-cell scale and only translates it
 * onto a shared anchor before resizing the whole cell - best for characters, so
 * a wide attack pose or a cape does not get vertically squashed.
 */
export function processSheet(img: RgbaImage, opts: ProcessOptions): ProcessResult {
  const { rows, cols, cellSize } = opts;
  const align: Align = opts.align ?? "center";
  const strategy: ScaleStrategy = opts.scaleStrategy ?? "fit";
  const fitScale = opts.fitScale ?? 0.85;

  const cleaned = chromaKeyMagenta(img, opts.threshold, opts.edgeThreshold);
  const cells = splitCells(cleaned, rows, cols);
  const cellW = cells[0]?.width ?? 0;
  const cellH = cells[0]?.height ?? 0;

  const qc: FrameQc[] = cells.map((cell, index) => {
    const bbox = getBBox(cell);
    return {
      index,
      row: Math.floor(index / cols),
      col: index % cols,
      bbox,
      subjectSize: bbox ? [bbox[2] - bbox[0], bbox[3] - bbox[1]] : [0, 0],
      edgeTouch: bbox ? bboxTouchesEdge(bbox, cell.width, cell.height) : false,
    };
  });

  const frames: RgbaImage[] =
    strategy === "preserve"
      ? renderPreserve(cells, qc, cellSize, cellW, cellH, align, fitScale)
      : renderFit(cells, qc, cellSize, align, fitScale);

  const sheet = createImage(cols * cellSize, rows * cellSize);
  frames.forEach((frame, index) => {
    const r = Math.floor(index / cols);
    const c = index % cols;
    pasteOnto(sheet, frame, c * cellSize, r * cellSize);
  });

  const subjectHeights = qc.filter((f) => f.bbox).map((f) => f.subjectSize[1]);
  const maxH = Math.max(0, ...subjectHeights);
  const minH = subjectHeights.length > 0 ? Math.min(...subjectHeights) : 0;
  const scaleDrift = subjectHeights.length >= 2 && maxH > 0 ? (maxH - minH) / maxH : 0;

  return {
    frames,
    sheet,
    qc,
    rows,
    cols,
    cellSize,
    edgeTouchFrames: qc.filter((f) => f.edgeTouch).map((f) => f.index),
    scaleDrift,
  };
}

function renderFit(
  cells: RgbaImage[],
  qc: FrameQc[],
  cellSize: number,
  align: Align,
  fitScale: number,
): RgbaImage[] {
  return cells.map((cell, index) => {
    const canvas = createImage(cellSize, cellSize);
    const bbox = qc[index].bbox;
    if (!bbox) return canvas;
    const subject = cropImage(cell, bbox);
    const scale = Math.min(cellSize / subject.width, cellSize / subject.height) * fitScale;
    const w = Math.max(1, Math.round(subject.width * scale));
    const h = Math.max(1, Math.round(subject.height * scale));
    const resized = resizeBilinear(subject, w, h);
    const px = Math.round((cellSize - w) / 2);
    const py =
      align === "feet"
        ? cellSize - h - Math.max(0, Math.round((cellSize * (1 - fitScale)) / 2))
        : Math.round((cellSize - h) / 2);
    pasteOnto(canvas, resized, px, py);
    return canvas;
  });
}

function renderPreserve(
  cells: RgbaImage[],
  qc: FrameQc[],
  cellSize: number,
  cellW: number,
  cellH: number,
  align: Align,
  fitScale: number,
): RgbaImage[] {
  const centers = qc
    .filter((f) => f.bbox)
    .map((f) => ((f.bbox as BBox)[0] + (f.bbox as BBox)[2]) / 2);
  const sharedCenterX = centers.length > 0 ? median(centers) : cellW / 2;
  const feetY =
    align === "feet" ? cellH - Math.max(0, Math.round((cellH * (1 - fitScale)) / 2)) : cellH / 2;

  return cells.map((cell, index) => {
    const source = createImage(cellW, cellH);
    const bbox = qc[index].bbox;
    if (bbox) {
      const subject = cropImage(cell, bbox);
      const px = Math.round(sharedCenterX - subject.width / 2);
      const py =
        align === "feet"
          ? Math.round(feetY - subject.height)
          : Math.round(feetY - subject.height / 2);
      pasteOnto(source, subject, px, py);
    }
    return resizeBilinear(source, cellSize, cellSize);
  });
}
