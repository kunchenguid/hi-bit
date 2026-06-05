import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectVoiceSupport,
  downmixToMono,
  framesToMono16k,
  isAudioSilent,
  isLikelyHallucination,
  mergeFloat32,
  resampleLinear,
} from "./voiceInput";

type Stubs = { gpu?: unknown; mediaDevices?: unknown; mediaRecorder?: unknown };

/** Installs the browser globals detectVoiceSupport probes, returning a restore fn. */
function stubEnv({ gpu, mediaDevices, mediaRecorder }: Stubs): () => void {
  const nav = navigator as unknown as Record<string, unknown>;
  const originalGpu = Object.getOwnPropertyDescriptor(nav, "gpu");
  const originalMedia = Object.getOwnPropertyDescriptor(nav, "mediaDevices");
  const originalRecorder = (globalThis as Record<string, unknown>).MediaRecorder;
  Object.defineProperty(nav, "gpu", { value: gpu, configurable: true });
  Object.defineProperty(nav, "mediaDevices", { value: mediaDevices, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = mediaRecorder;
  return () => {
    if (originalGpu) Object.defineProperty(nav, "gpu", originalGpu);
    else delete nav.gpu;
    if (originalMedia) Object.defineProperty(nav, "mediaDevices", originalMedia);
    else delete nav.mediaDevices;
    (globalThis as Record<string, unknown>).MediaRecorder = originalRecorder;
  };
}

const recorder = function MediaRecorder() {};
const mediaDevices = { getUserMedia: () => Promise.resolve({}) };

describe("detectVoiceSupport", () => {
  let restore = () => {};
  afterEach(() => restore());

  it("is false when WebGPU is absent", async () => {
    restore = stubEnv({ gpu: undefined, mediaDevices, mediaRecorder: recorder });
    expect(await detectVoiceSupport()).toBe(false);
  });

  it("is false when no WebGPU adapter can be acquired", async () => {
    restore = stubEnv({
      gpu: { requestAdapter: vi.fn(async () => null) },
      mediaDevices,
      mediaRecorder: recorder,
    });
    expect(await detectVoiceSupport()).toBe(false);
  });

  it("is false when microphone capture is unavailable even with WebGPU", async () => {
    restore = stubEnv({
      gpu: { requestAdapter: vi.fn(async () => ({})) },
      mediaDevices: undefined,
      mediaRecorder: recorder,
    });
    expect(await detectVoiceSupport()).toBe(false);
  });

  it("is false when requesting an adapter throws", async () => {
    restore = stubEnv({
      gpu: {
        requestAdapter: vi.fn(async () => {
          throw new Error("no gpu");
        }),
      },
      mediaDevices,
      mediaRecorder: recorder,
    });
    expect(await detectVoiceSupport()).toBe(false);
  });

  it("is true with a WebGPU adapter and microphone capture", async () => {
    restore = stubEnv({
      gpu: { requestAdapter: vi.fn(async () => ({})) },
      mediaDevices,
      mediaRecorder: recorder,
    });
    expect(await detectVoiceSupport()).toBe(true);
  });
});

describe("downmixToMono", () => {
  it("returns the single channel unchanged for mono input", () => {
    const mono = new Float32Array([0.1, 0.2, 0.3]);
    expect(downmixToMono([mono])).toBe(mono);
  });

  it("averages stereo channels sample by sample", () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 0, 1]);
    expect(Array.from(downmixToMono([left, right]))).toEqual([0.5, 0, 0]);
  });
});

describe("resampleLinear", () => {
  it("returns the input unchanged when rates match", () => {
    const input = new Float32Array([0, 1, 2, 3]);
    expect(resampleLinear(input, 16000, 16000)).toBe(input);
  });

  it("downsamples to the expected length", () => {
    const input = new Float32Array(48000); // 1s at 48kHz
    const out = resampleLinear(input, 48000, 16000);
    expect(out.length).toBe(16000); // 1s at 16kHz
  });

  it("linearly interpolates between samples when downsampling", () => {
    const input = new Float32Array([0, 10, 20, 30]);
    const out = resampleLinear(input, 4, 2); // halve the rate -> indices 0 and 2
    expect(Array.from(out)).toEqual([0, 20]);
  });
});

describe("mergeFloat32", () => {
  it("concatenates frames in order", () => {
    const out = mergeFloat32([
      new Float32Array([1, 2]),
      new Float32Array([3]),
      new Float32Array([]),
    ]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("returns an empty array for no frames", () => {
    expect(mergeFloat32([]).length).toBe(0);
  });
});

describe("framesToMono16k", () => {
  it("merges frames then resamples to 16kHz", () => {
    const frames = [new Float32Array(24000), new Float32Array(24000)]; // 1s at 48kHz
    expect(framesToMono16k(frames, 48000).length).toBe(16000);
  });
});

describe("isAudioSilent", () => {
  it("treats an empty or near-zero clip as silent", () => {
    expect(isAudioSilent(new Float32Array(0))).toBe(true);
    expect(isAudioSilent(new Float32Array(1000))).toBe(true); // all zeros
  });

  it("treats a clip with real signal as not silent", () => {
    const loud = new Float32Array(1000).map((_, i) => (i % 2 ? 0.3 : -0.3));
    expect(isAudioSilent(loud)).toBe(false);
  });
});

describe("isLikelyHallucination", () => {
  it("flags stock whisper phrases that are the whole transcript", () => {
    for (const text of ["", "  ", "Thank you.", "you", "Thanks for watching!", "[BLANK_AUDIO]"]) {
      expect(isLikelyHallucination(text)).toBe(true);
    }
  });

  it("keeps real kid prompts, even ones containing those words", () => {
    for (const text of ["make a snake game", "thank you Bit", "a page about you and me"]) {
      expect(isLikelyHallucination(text)).toBe(false);
    }
  });
});
