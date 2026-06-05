import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Bit's "look at the app" tool.
 *
 * The kid only ever talks to Bit, and the things they describe are usually
 * visual: "this button is in the wrong spot", "it looks weird", "why is my game
 * like this?". `view_screen` hands Bit a PNG of the whole Hi-Bit renderer - the
 * chat, the chrome, and the live creation preview - so Bit can actually look
 * before answering instead of guessing.
 *
 * The capture itself is an Electron concern (`webContents.capturePage()`), so it
 * is injected as `capture`; this module stays free of Electron so it can be unit
 * tested. Like `view_bit`/`search_image`, the PNG lives only in the model's
 * session transcript - `stripImageData` swaps it for a placeholder in logbooks
 * and renderer-bound tool events, and session persistence drops it too.
 */

/** Pixel dimensions of a captured frame. */
export type CaptureSize = { width: number; height: number };

/**
 * Plans a downscale that caps the *shorter* edge at `maxShorterEdge`, preserving
 * aspect ratio. Returns `null` when the frame is already small enough (no upscale
 * - we never invent detail). High-DPI displays make `capturePage()` return frames
 * at the device scale factor (e.g. a 1280x820 window at 2x is 2560x1640), so the
 * cap keeps the image legible for the vision model without spending image tokens
 * on Retina-doubled pixels.
 */
export function planShorterEdgeResize(
  size: CaptureSize,
  maxShorterEdge: number,
): CaptureSize | null {
  const shorter = Math.min(size.width, size.height);
  if (shorter <= maxShorterEdge) return null;
  const scale = maxShorterEdge / shorter;
  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  };
}

export type ViewScreenToolDeps = {
  /**
   * Captures the current app renderer and returns a base64 PNG, or `null` when
   * there is no live window to capture (e.g. during shutdown). Injected so the
   * Electron capture path is wired in `index.ts` and the tool stays testable.
   */
  capture: () => Promise<string | null>;
};

/**
 * `view_screen`: hands Bit a picture of the whole Hi-Bit screen the builder is
 * looking at right now, including the live creation preview. Bit-only - bots
 * never get it, since only Bit talks to the kid.
 */
export function createViewScreenTool(deps: ViewScreenToolDeps): ToolDefinition {
  return defineTool({
    name: "view_screen",
    label: "Look at the screen",
    description:
      'Take a picture of the whole Hi-Bit app screen the builder is looking at right now - the chat, the buttons and layout, and the live creation preview if one is open - so you can actually see what they see. Call it when the builder describes something visual about the app or their creation ("this looks weird", "the button is in the wrong place", "why does it look like this?") and you need to look before answering. Use it when it helps, not on every turn. No input needed.',
    parameters: Type.Object({}),
    executionMode: "parallel",
    async execute() {
      const data = await deps.capture();
      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: "Couldn't capture the screen right now - there's no live app window to look at.",
            },
          ],
          details: { source: "app_screen", captured: false },
        };
      }
      return {
        content: [
          {
            type: "text",
            text: "This is the whole Hi-Bit screen the builder is looking at right now, including the live preview if one is open.",
          },
          { type: "image", data, mimeType: "image/png" },
        ],
        details: { source: "app_screen", captured: true },
      };
    },
  });
}
