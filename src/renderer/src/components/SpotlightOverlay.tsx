import type { SpotlightRect } from "@shared/browser";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PAD = 8;
const GAP = 8;
const MARGIN = 8;

/**
 * The tutorial spotlight. Bit calls `app_highlight(ref)`; main resolves the ref
 * to a viewport rect and pushes it here, where we draw a friendly ring (with a
 * caption) over the app so the kid sees exactly what to tap. Bit never taps for
 * them - it only points.
 *
 * It behaves like a dismiss-on-click modal with a hole:
 * - Four dim panels surround the highlighted rect and absorb clicks anywhere
 *   else, so a tap outside just dismisses (it never reaches the app behind).
 * - The hole itself is uncovered, so a tap there passes straight through to the
 *   real control (the kid actually presses the button) - and still dismisses,
 *   via a capture-phase listener that clears the spotlight on any click.
 * - Escape dismisses too.
 *
 * The caption is measured and clamped to the viewport (flipping above the hole
 * when there's no room below), so it never runs off the screen edge.
 */
export function SpotlightOverlay() {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [labelPos, setLabelPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => window.hibit.browser.onSpotlight(setRect), []);

  // Any click (capture phase, so it fires before the target handles it) or
  // Escape dismisses. A click in the hole still reaches the real control; a
  // click on a dim panel is absorbed by it. Either way the spotlight clears.
  useEffect(() => {
    if (!rect) return;
    const dismiss = () => setRect(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [rect]);

  // Place the caption centered under the hole, flipped above when there's no
  // room below, and clamped horizontally so it stays fully on screen.
  useLayoutEffect(() => {
    if (!rect || !labelRef.current) {
      setLabelPos(null);
      return;
    }
    const lw = labelRef.current.offsetWidth;
    const lh = labelRef.current.offsetHeight;
    const holeLeft = rect.x - PAD;
    const holeRight = rect.x + rect.width + PAD;
    const holeTop = rect.y - PAD;
    const holeBottom = rect.y + rect.height + PAD;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = holeBottom + GAP;
    if (top + lh > vh - MARGIN) top = holeTop - GAP - lh;
    top = Math.max(MARGIN, top);
    let left = (holeLeft + holeRight) / 2 - lw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - lw - MARGIN));
    setLabelPos({ left, top });
  }, [rect]);

  if (!rect) return null;
  const hx = rect.x - PAD;
  const hy = rect.y - PAD;
  const hw = rect.width + PAD * 2;
  const hh = rect.height + PAD * 2;
  return (
    <div className="hb-spotlight-layer" role="presentation">
      <div
        className="hb-spotlight-mask"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, hy) }}
      />
      <div className="hb-spotlight-mask" style={{ top: hy + hh, left: 0, right: 0, bottom: 0 }} />
      <div
        className="hb-spotlight-mask"
        style={{ top: hy, left: 0, width: Math.max(0, hx), height: hh }}
      />
      <div className="hb-spotlight-mask" style={{ top: hy, left: hx + hw, right: 0, height: hh }} />
      <div className="hb-spotlight-ring" style={{ left: hx, top: hy, width: hw, height: hh }} />
      {rect.label ? (
        <div
          ref={labelRef}
          className="hb-spotlight-label"
          style={
            labelPos
              ? { left: labelPos.left, top: labelPos.top }
              : { left: -9999, top: -9999, visibility: "hidden" }
          }
        >
          {rect.label}
        </div>
      ) : null}
    </div>
  );
}
