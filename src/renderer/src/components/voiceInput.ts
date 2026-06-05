/** The sample rate Whisper expects: 16kHz mono. */
export const VOICE_SAMPLE_RATE = 16000;

/** Messages the renderer sends into the Whisper worker. */
export type WhisperRequest = { type: "init" } | { type: "transcribe"; audio: Float32Array };

/** Messages the Whisper worker sends back. */
export type WhisperResponse =
  | { type: "ready" }
  | { type: "result"; text: string }
  | { type: "error"; message: string };

/**
 * Whether this device can run local voice input. Gated on WebGPU (the Whisper
 * model is far too slow without it, so a missing/unusable adapter means "hide
 * the feature") plus the microphone-capture APIs we need. Pure capability
 * check - never throws.
 */
export async function detectVoiceSupport(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    if (typeof AudioContext === "undefined") return false;
    if (!("audioWorklet" in AudioContext.prototype)) return false;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } })
      .gpu;
    if (!gpu?.requestAdapter) return false;
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

/** Averages interleaved channels down to a single mono track. */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Resamples mono PCM from `inputRate` to `outputRate` with linear interpolation.
 * Good enough for speech recognition and dependency-free. Returns the input
 * untouched when the rates already match.
 */
export function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outLength = Math.round(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Concatenates captured PCM frames into one contiguous Float32Array. */
export function mergeFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Merges raw capture frames and resamples to the 16kHz mono Whisper expects. */
export function framesToMono16k(frames: Float32Array[], inputRate: number): Float32Array {
  return resampleLinear(mergeFloat32(frames), inputRate, VOICE_SAMPLE_RATE);
}

/**
 * Whether a clip is effectively silent (RMS below `threshold`) - used to skip
 * transcribing an accidental tap or empty room, which Whisper would otherwise
 * "hear" as a stock phrase. Threshold is tunable; auto-gain can lift a quiet
 * room's floor.
 */
export function isAudioSilent(samples: Float32Array, threshold = 0.006): boolean {
  if (samples.length === 0) return true;
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / samples.length) < threshold;
}

/**
 * Whisper hallucinates stock phrases on silence/noise ("Thank you.", "you",
 * "Thanks for watching"). Drop the output only when the *entire* transcript is
 * one of these, so a kid genuinely saying "thank you Bit" still goes through.
 */
const STOCK_HALLUCINATIONS = new Set([
  "",
  "you",
  "thank you",
  "thanks",
  "thank you very much",
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "subscribe",
  "bye",
  "bye bye",
  "okay",
  "ok",
  "music",
  "applause",
  "blank audio",
  "blankaudio",
]);

export function isLikelyHallucination(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return STOCK_HALLUCINATIONS.has(normalized);
}
