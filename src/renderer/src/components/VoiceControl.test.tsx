// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceControl } from "./VoiceControl";
import { transcribeAudio, warmUpWhisper } from "./whisperClient";

vi.mock("./whisperClient", () => ({
  transcribeAudio: vi.fn(),
  warmUpWhisper: vi.fn(),
}));

const { MockRecorder, recorderInstances } = vi.hoisted(() => {
  const instances: MockRecorder[] = [];

  class MockRecorder {
    onLimitReached: (() => void) | null = null;
    stopped = false;
    samples = new Float32Array(16000).fill(0.2);
    start = vi.fn(async () => {});
    beginCapture = vi.fn();
    endCapture = vi.fn(() => this.samples);
    stop = vi.fn(() => {
      this.stopped = true;
    });
    getAnalyser = vi.fn(() => null);

    constructor() {
      instances.push(this);
    }
  }

  return { MockRecorder, recorderInstances: instances };
});

vi.mock("./micRecorder", () => ({ MicRecorder: MockRecorder }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const mockedWarmUpWhisper = vi.mocked(warmUpWhisper);
const mockedTranscribeAudio = vi.mocked(transcribeAudio);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("VoiceControl", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.PointerEvent = window.PointerEvent ?? window.MouseEvent;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    recorderInstances.length = 0;
    mockedWarmUpWhisper.mockResolvedValue();
    mockedTranscribeAudio.mockResolvedValue("make a game");
    window.hibit = {
      voice: {
        status: vi.fn(async () => ({ modelReady: true })),
        ensureModel: vi.fn(async () => {}),
        onDownloadProgress: vi.fn(() => vi.fn()),
      },
    } as unknown as typeof window.hibit;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it("stops the microphone before awaiting transcription", async () => {
    const transcription = deferred<string>();
    mockedTranscribeAudio.mockReturnValue(transcription.promise);
    act(() => root.render(<VoiceControl onVoiceText={vi.fn()} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(recorderInstances[0]?.stop).toHaveBeenCalled();
    expect(mockedTranscribeAudio).toHaveBeenCalled();
    transcription.resolve("make a game");
    await flush();
  });

  it("starts recording without waiting for the model to warm up", async () => {
    // Warm-up never resolves: recording must not depend on it. The model is only
    // needed at transcribe time, so the mic should open and capture immediately.
    mockedWarmUpWhisper.mockReturnValue(deferred<void>().promise);
    act(() => root.render(<VoiceControl onVoiceText={vi.fn()} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(recorderInstances[0]?.start).toHaveBeenCalled();
    expect(recorderInstances[0]?.beginCapture).toHaveBeenCalled();
    expect(host.querySelector(".hb-voice-wave")).not.toBeNull();
  });

  it("does not open the microphone after canceling the model download", async () => {
    const download = deferred<void>();
    window.hibit.voice.status = vi.fn(async () => ({ modelReady: false }));
    window.hibit.voice.ensureModel = vi.fn(() => download.promise);
    act(() => root.render(<VoiceControl onVoiceText={vi.fn()} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    const cancel = host.querySelector<HTMLButtonElement>(".hb-voice-actions button");
    if (!cancel) throw new Error("cancel button not found");
    act(() => cancel.click());

    download.resolve();
    await flush();

    expect(recorderInstances).toHaveLength(0);
    expect(host.querySelector(".hb-voice-callout")).toBeNull();
  });

  it("does not open the microphone after unmounting during the model download", async () => {
    const download = deferred<void>();
    window.hibit.voice.status = vi.fn(async () => ({ modelReady: false }));
    window.hibit.voice.ensureModel = vi.fn(() => download.promise);
    act(() => root.render(<VoiceControl onVoiceText={vi.fn()} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => root.unmount());

    download.resolve();
    await flush();

    expect(recorderInstances).toHaveLength(0);
  });

  it("unsubscribes from download progress when model preparation is canceled", async () => {
    const ensureModel = deferred<void>();
    const offProgress = vi.fn();
    window.hibit.voice.status = vi.fn(async () => ({ modelReady: false }));
    window.hibit.voice.ensureModel = vi.fn(() => ensureModel.promise);
    window.hibit.voice.onDownloadProgress = vi.fn(() => offProgress);
    act(() => root.render(<VoiceControl onVoiceText={vi.fn()} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    const cancel = host.querySelector<HTMLButtonElement>(".hb-voice-actions button");
    if (!cancel) throw new Error("cancel button not found");
    act(() => cancel.click());

    ensureModel.resolve();
    await flush();

    expect(offProgress).toHaveBeenCalledTimes(1);
  });

  it("shows an anchored callout, not a modal dialog, while recording", async () => {
    act(() => root.render(<VoiceControl onVoiceText={vi.fn()} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    const callout = host.querySelector(".hb-voice-callout");
    expect(callout).not.toBeNull();
    // An ephemeral status readout anchored to the mic - not a focus-trapping
    // modal, and no dimming backdrop over the chat.
    expect(callout?.getAttribute("role")).toBe("status");
    expect(host.querySelector("[role='dialog']")).toBeNull();
    expect(host.querySelector(".hb-camera-backdrop")).toBeNull();
  });

  it("turns the mic into a stop control that ends a hands-free recording on the next tap", async () => {
    const onVoiceText = vi.fn();
    act(() => root.render(<VoiceControl onVoiceText={onVoiceText} />));

    const mic = host.querySelector<HTMLButtonElement>("button[aria-label='Talk to Bit']");
    if (!mic) throw new Error("mic button not found");
    // Release before begin() finishes recording setup -> hands-free (toggle) mode.
    await act(async () => {
      mic.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      mic.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    // The mic itself becomes the stop control; there is no separate Stop button.
    const stop = host.querySelector<HTMLButtonElement>("button[aria-label='Stop recording']");
    expect(stop).not.toBeNull();
    expect(host.querySelector(".hb-voice-callout")).not.toBeNull();

    // Tapping it again ends the capture and transcribes.
    await act(async () => {
      stop?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await flush();

    expect(mockedTranscribeAudio).toHaveBeenCalled();
    expect(onVoiceText).toHaveBeenCalledWith("make a game");
  });
});
