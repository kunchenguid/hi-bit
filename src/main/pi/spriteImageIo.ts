/**
 * PNG decode/encode and animated-GIF encode for the sprite pipeline.
 *
 * Kept separate from `spriteProcessor.ts` so the pixel math stays pure; this is
 * the only place that touches the `pngjs` / `gifenc` byte formats.
 */

import { createRequire } from "node:module";
import type { RgbaImage } from "./spriteProcessor";

// pngjs and gifenc are CommonJS. electron-vite externalizes them and emits the
// main process as ESM, where named imports from a CJS module fail at runtime
// ("Named export 'GIFEncoder' not found"). Loading them through createRequire
// pulls the real module.exports regardless of how the bundle is built.
const nodeRequire = createRequire(import.meta.url);
const { PNG } = nodeRequire("pngjs") as typeof import("pngjs");
const { applyPalette, GIFEncoder, quantize } = nodeRequire("gifenc") as typeof import("gifenc");

export function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function encodePng(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
}

/**
 * Encode frames as a looping transparent GIF. A single global palette is built
 * from every frame (with a reserved transparent entry) so colors stay stable
 * frame to frame; `dispose: 2` clears each frame so transparency doesn't smear.
 */
export function encodeGif(frames: RgbaImage[], fps = 8): Buffer {
  if (frames.length === 0) throw new Error("Cannot encode a GIF with no frames.");
  const delay = Math.max(20, Math.round(1000 / Math.max(1, fps)));

  const combined = new Uint8Array(frames.reduce((sum, f) => sum + f.data.length, 0));
  let offset = 0;
  for (const frame of frames) {
    combined.set(frame.data, offset);
    offset += frame.data.length;
  }

  const palette = quantize(combined, 256, { format: "rgba4444", oneBitAlpha: true });
  let transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0);
  if (transparentIndex < 0) transparentIndex = 0;

  const encoder = GIFEncoder();
  frames.forEach((frame, index) => {
    const indexed = applyPalette(frame.data, palette, "rgba4444");
    encoder.writeFrame(indexed, frame.width, frame.height, {
      palette: index === 0 ? palette : undefined,
      transparent: true,
      transparentIndex,
      delay,
      dispose: 2,
      repeat: 0,
    });
  });
  encoder.finish();
  return Buffer.from(encoder.bytes());
}
