import { THINKING_SPEED_STOPS, type ThinkingSpeed } from "@shared/config";

type ThinkingSpeedControlProps = {
  value: ThinkingSpeed;
  busy: boolean;
  onChange: (speed: ThinkingSpeed) => void;
};

/**
 * A grown-up control trading reply speed for build quality. It is a five-stop
 * slider from "Fastest" to "Smartest"; the chosen stop maps straight to the Pi
 * runtime's thinking effort for both Bit and the bots.
 */
export function ThinkingSpeedControl({ value, busy, onChange }: ThinkingSpeedControlProps) {
  const index = Math.max(
    0,
    THINKING_SPEED_STOPS.findIndex((stop) => stop.value === value),
  );
  const current = THINKING_SPEED_STOPS[index] ?? THINKING_SPEED_STOPS[0];

  return (
    <div className="hb-speed-control">
      <div className="hb-speed-control-head">
        <label htmlFor="hb-speed-slider">How hard Bit thinks</label>
        <span className="hb-speed-control-value">{current.label}</span>
      </div>
      <input
        id="hb-speed-slider"
        className="hb-speed-slider"
        type="range"
        min={0}
        max={THINKING_SPEED_STOPS.length - 1}
        step={1}
        value={index}
        disabled={busy}
        aria-valuetext={current.label}
        onChange={(event) => {
          const next = THINKING_SPEED_STOPS[Number(event.currentTarget.value)];
          if (next && next.value !== value) onChange(next.value);
        }}
      />
      <div className="hb-speed-control-ends">
        <span>Faster replies</span>
        <span>Smarter builds</span>
      </div>
    </div>
  );
}
