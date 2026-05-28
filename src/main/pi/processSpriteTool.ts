import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { decodePng, encodeGif, encodePng } from "./spriteImageIo";
import { type Align, chromaKeyMagenta, processSheet, type ScaleStrategy } from "./spriteProcessor";

/**
 * `process_sprite_sheet` worker tool.
 *
 * The art model draws a grid sheet on a solid magenta (#FF00FF) background; this
 * tool turns that raw PNG into game-ready output: it keys out the magenta,
 * slices the grid, aligns/scales each frame, runs quality checks, and writes a
 * transparent sheet, per-frame PNGs, an animated GIF, and a `sprite-meta.json`
 * the in-game renderer reads to animate. All purely local - no Codex quota. The
 * gaming doctrine (how to prompt, which grid, fit vs preserve) lives in the
 * `game-assets` skill; this tool is just the mechanical processor.
 */

const TOOL_PARAMS = Type.Object({
  inputFile: Type.String({
    description:
      "Relative path inside the creation to the raw magenta-background sheet PNG, e.g. 'assets/raw/hero-walk.png'.",
  }),
  outputDir: Type.String({
    description:
      "Relative folder inside the creation to write the processed bundle into, e.g. 'assets/sprites/hero-walk'.",
  }),
  rows: Type.Integer({ minimum: 1, maximum: 12, description: "Grid rows in the raw sheet." }),
  cols: Type.Integer({ minimum: 1, maximum: 12, description: "Grid columns in the raw sheet." }),
  cellSize: Type.Optional(
    Type.Integer({
      minimum: 16,
      maximum: 1024,
      description: "Output frame size in pixels (square). Defaults to 96 for 4x4, otherwise 128.",
    }),
  ),
  align: Type.Optional(
    Type.Union([Type.Literal("center"), Type.Literal("feet")], {
      description:
        "How to anchor the subject in each frame. Use 'feet' for characters/creatures that stand on the ground, 'center' for icons/projectiles/FX.",
    }),
  ),
  scaleStrategy: Type.Optional(
    Type.Union([Type.Literal("fit"), Type.Literal("preserve")], {
      description:
        "'preserve' keeps the drawn size and only re-anchors (use for characters, so capes/weapons/wide poses survive). 'fit' scales each subject to fill the cell (use for projectiles, icons, pickups, FX). Use the SAME strategy for every action sheet of one character.",
    }),
  ),
  fps: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 60,
      description: "Animation speed for the GIF + meta. Default 8.",
    }),
  ),
  frameName: Type.Optional(
    Type.String({ description: "Prefix for per-frame PNG files, e.g. 'walk'. Default 'frame'." }),
  ),
  rejectEdgeTouch: Type.Optional(
    Type.Boolean({
      description:
        "If true, fail (instead of writing output) when any frame's subject touches a cell edge, so you can regenerate the raw sheet. Default false.",
    }),
  ),
});

type ToolParams = {
  inputFile: string;
  outputDir: string;
  rows: number;
  cols: number;
  cellSize?: number;
  align?: Align;
  scaleStrategy?: ScaleStrategy;
  fps?: number;
  frameName?: string;
  rejectEdgeTouch?: boolean;
};

type ToolCtx = { cwd: string };

const MAX_OUTPUT_PIXELS = 4_194_304;

export function assertSpriteOutputBudget(opts: {
  rows: number;
  cols: number;
  cellSize: number;
}): void {
  const frames = opts.rows * opts.cols;
  const outputPixels = frames * opts.cellSize * opts.cellSize;
  if (outputPixels <= MAX_OUTPUT_PIXELS) return;
  const maxSide = Math.floor(Math.sqrt(MAX_OUTPUT_PIXELS / frames));
  throw new Error(
    `Sprite output is too large: ${frames} frames at ${opts.cellSize}px each. Use ${maxSide}px or smaller for this grid, or reduce rows/cols.`,
  );
}

/** Resolves a path under cwd, rejecting anything that escapes the Workbench. */
function resolveInside(cwd: string, relPath: string, label: string): string {
  const target = resolve(cwd, relPath);
  const rel = relative(cwd, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`The ${label} must be inside the creation, not outside it.`);
  }
  return target;
}

function defaultCellSize(rows: number, cols: number): number {
  return rows === 4 && cols === 4 ? 96 : 128;
}

export function createProcessSpriteTool(): ToolDefinition {
  return defineTool({
    name: "process_sprite_sheet",
    label: "Process sprite sheet",
    description:
      "Turn a raw magenta-background grid sheet (from generate_image) into a game-ready transparent sprite sheet: keys out the magenta, slices frames, aligns/scales them, checks quality, and writes a transparent sheet, frame PNGs, an animated GIF, and sprite-meta.json for the in-game renderer. Local and free (no image quota). See the game-assets skill for how to use it.",
    parameters: TOOL_PARAMS,
    executionMode: "parallel",
    async execute(_callId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as ToolParams;
      const cwd = (ctx as ToolCtx).cwd;
      const inputPath = resolveInside(cwd, params.inputFile, "sheet");
      const outDir = resolveInside(cwd, params.outputDir, "output folder");

      const cellSize = params.cellSize ?? defaultCellSize(params.rows, params.cols);
      const align: Align = params.align ?? (params.scaleStrategy === "fit" ? "center" : "feet");
      const scaleStrategy: ScaleStrategy = params.scaleStrategy ?? "preserve";
      const fps = params.fps ?? 8;
      const prefix = (params.frameName ?? "frame").replace(/[^a-zA-Z0-9_-]+/g, "-");

      assertSpriteOutputBudget({ rows: params.rows, cols: params.cols, cellSize });

      const raw = decodePng(await readFile(inputPath));
      const result = processSheet(raw, {
        rows: params.rows,
        cols: params.cols,
        cellSize,
        align,
        scaleStrategy,
      });

      if (params.rejectEdgeTouch && result.edgeTouchFrames.length > 0) {
        throw new Error(
          `${result.edgeTouchFrames.length} frame(s) touch a cell edge (frames ${result.edgeTouchFrames.join(", ")}). Regenerate the raw sheet with more margin around each subject, or turn off rejectEdgeTouch.`,
        );
      }

      await mkdir(outDir, { recursive: true });
      const frameFiles = result.frames.map((_, index) => `${prefix}-${index + 1}.png`);
      await Promise.all([
        writeFile(join(outDir, "raw-sheet-clean.png"), encodePng(chromaKeyMagenta(raw))),
        writeFile(join(outDir, "sheet-transparent.png"), encodePng(result.sheet)),
        writeFile(join(outDir, "animation.gif"), encodeGif(result.frames, fps)),
        ...result.frames.map((frame, index) =>
          writeFile(join(outDir, frameFiles[index]), encodePng(frame)),
        ),
      ]);

      const meta = {
        version: 1 as const,
        image: "sheet-transparent.png",
        frameWidth: cellSize,
        frameHeight: cellSize,
        columns: params.cols,
        rows: params.rows,
        frameCount: result.frames.length,
        fps,
        align,
        scaleStrategy,
        frameFiles,
        gif: "animation.gif",
        scaleDrift: Number(result.scaleDrift.toFixed(3)),
        edgeTouchFrames: result.edgeTouchFrames,
      };
      await writeFile(join(outDir, "sprite-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

      const relOut = relative(cwd, outDir);
      const driftPct = Math.round(result.scaleDrift * 100);
      const notes: string[] = [];
      if (result.edgeTouchFrames.length > 0) {
        notes.push(`heads up: ${result.edgeTouchFrames.length} frame(s) touch a cell edge`);
      }
      if (scaleStrategy === "preserve" && driftPct > 20) {
        notes.push(`sizes vary ${driftPct}% across frames - regenerate if it looks jumpy`);
      }
      const summary = `Made a sprite sheet in ${relOut}: ${result.frames.length} frames, ${cellSize}px each, animated GIF + sprite-meta.json. Point the renderer at ${relOut}/sprite-meta.json.${
        notes.length > 0 ? ` (${notes.join("; ")})` : ""
      }`;

      return {
        content: [{ type: "text", text: summary }],
        details: {
          outputDir: relOut,
          frameCount: result.frames.length,
          cellSize,
          scaleDrift: meta.scaleDrift,
          edgeTouchFrames: result.edgeTouchFrames,
        },
      };
    },
  });
}
