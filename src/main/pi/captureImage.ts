/** Pixel dimensions of a captured frame. */
export type CaptureSize = { width: number; height: number };

/**
 * Plans a downscale that caps the *shorter* edge at `maxShorterEdge`, preserving
 * aspect ratio. Returns `null` when the frame is already small enough (no upscale
 * - we never invent detail). High-DPI displays make `capturePage()` return frames
 * at the device scale factor (e.g. a 1280x820 window at 2x is 2560x1640), so the
 * cap keeps the image legible for the vision model without spending image tokens
 * on Retina-doubled pixels. Backs Bit's `app_screenshot` / `browser_screenshot`.
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
