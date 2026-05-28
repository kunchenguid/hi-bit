import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProcessSpriteTool } from "./processSpriteTool";
import { encodePng } from "./spriteImageIo";
import { createImage } from "./spriteProcessor";

const MAGENTA: [number, number, number, number] = [255, 0, 255, 255];

function rawSheetPng(rows: number, cols: number, cellW: number, cellH: number): Buffer {
  const img = createImage(cols * cellW, rows * cellH);
  for (let i = 0; i < img.width * img.height; i += 1) {
    img.data[i * 4] = MAGENTA[0];
    img.data[i * 4 + 1] = MAGENTA[1];
    img.data[i * 4 + 2] = MAGENTA[2];
    img.data[i * 4 + 3] = MAGENTA[3];
  }
  // a centered opaque block per cell
  const bw = Math.floor(cellW / 2);
  const bh = Math.floor(cellH / 2);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const ox = c * cellW + Math.floor((cellW - bw) / 2);
      const oy = r * cellH + Math.floor((cellH - bh) / 2);
      for (let y = 0; y < bh; y += 1) {
        for (let x = 0; x < bw; x += 1) {
          const i = ((oy + y) * img.width + ox + x) * 4;
          img.data[i] = 20;
          img.data[i + 1] = 120;
          img.data[i + 2] = 210;
          img.data[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(img);
}

const tool = createProcessSpriteTool();
let cwd = "";

async function run(params: Record<string, unknown>): Promise<{ text: string; details: unknown }> {
  // biome-ignore lint/suspicious/noExplicitAny: exercising the tool's runtime contract
  const result: any = await (tool as any).execute("call-1", params, undefined, undefined, { cwd });
  return { text: result.content[0].text as string, details: result.details };
}

afterEach(() => {
  cwd = "";
});

describe("process_sprite_sheet tool", () => {
  it("writes a transparent sheet, frames, gif, and meta from a raw magenta sheet", async () => {
    cwd = await mkdtemp(join(tmpdir(), "hibit-sprite-"));
    await writeFile(join(cwd, "raw.png"), rawSheetPng(2, 2, 32, 32));

    const { details } = await run({
      inputFile: "raw.png",
      outputDir: "assets/sprites/hero",
      rows: 2,
      cols: 2,
      scaleStrategy: "fit",
      frameName: "walk",
      fps: 10,
    });

    const base = join(cwd, "assets/sprites/hero");
    const meta = JSON.parse(await readFile(join(base, "sprite-meta.json"), "utf-8"));
    expect(meta.frameCount).toBe(4);
    expect(meta.columns).toBe(2);
    expect(meta.fps).toBe(10);
    expect(meta.image).toBe("sheet-transparent.png");
    expect(meta.frameFiles).toEqual(["walk-1.png", "walk-2.png", "walk-3.png", "walk-4.png"]);

    // the bundle files exist and the GIF is a real GIF
    await expect(readFile(join(base, "sheet-transparent.png"))).resolves.toBeTruthy();
    await expect(readFile(join(base, "walk-1.png"))).resolves.toBeTruthy();
    const gif = await readFile(join(base, "animation.gif"));
    expect(gif.subarray(0, 3).toString("ascii")).toBe("GIF");

    expect((details as { frameCount: number }).frameCount).toBe(4);
  });

  it("refuses to write outside the creation", async () => {
    cwd = await mkdtemp(join(tmpdir(), "hibit-sprite-"));
    await writeFile(join(cwd, "raw.png"), rawSheetPng(1, 1, 16, 16));
    await expect(
      run({ inputFile: "raw.png", outputDir: "../escape", rows: 1, cols: 1 }),
    ).rejects.toThrow(/inside the creation/);
  });

  it("can reject sheets whose subject touches a cell edge", async () => {
    cwd = await mkdtemp(join(tmpdir(), "hibit-sprite-"));
    // block fills the whole cell -> touches every edge
    await writeFile(join(cwd, "raw.png"), edgeSheet());
    await expect(
      run({ inputFile: "raw.png", outputDir: "out", rows: 1, cols: 1, rejectEdgeTouch: true }),
    ).rejects.toThrow(/touch a cell edge/);
  });
});

function edgeSheet(): Buffer {
  const img = createImage(16, 16);
  for (let i = 0; i < img.width * img.height; i += 1) {
    img.data[i * 4] = 20;
    img.data[i * 4 + 1] = 120;
    img.data[i * 4 + 2] = 210;
    img.data[i * 4 + 3] = 255; // fully opaque, fills the cell -> edge touch
  }
  return encodePng(img);
}
