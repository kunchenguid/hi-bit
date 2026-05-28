import { describe, expect, it } from "vitest";
import { decodePng, encodeGif, encodePng } from "./spriteImageIo";
import { createImage, type RgbaImage } from "./spriteProcessor";

function solid(w: number, h: number, rgba: [number, number, number, number]): RgbaImage {
  const img = createImage(w, h);
  for (let i = 0; i < w * h; i += 1) {
    img.data[i * 4] = rgba[0];
    img.data[i * 4 + 1] = rgba[1];
    img.data[i * 4 + 2] = rgba[2];
    img.data[i * 4 + 3] = rgba[3];
  }
  return img;
}

describe("encodePng / decodePng", () => {
  it("round-trips an RGBA image without losing pixels", () => {
    const img = solid(4, 3, [12, 200, 64, 255]);
    img.data[0] = 250; // perturb one pixel so it isn't uniform

    const decoded = decodePng(encodePng(img));

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(3);
    expect(Array.from(decoded.data)).toEqual(Array.from(img.data));
  });
});

describe("encodeGif", () => {
  it("produces a GIF89a byte stream from transparent frames", () => {
    const frames = [solid(8, 8, [200, 30, 30, 255]), solid(8, 8, [30, 30, 200, 0])];
    const gif = encodeGif(frames, 8);
    expect(gif.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    expect(gif.length).toBeGreaterThan(20);
  });

  it("rejects an empty frame list", () => {
    expect(() => encodeGif([], 8)).toThrow();
  });
});
