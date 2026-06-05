import captureWorkletUrl from "./captureWorklet.js?url";
import { framesToMono16k } from "./voiceInput";

/**
 * How much audio to keep buffered before capture officially starts, so a kid who
 * begins talking a moment before fully pressing the button doesn't lose their
 * first word. OpenSuperWhisper has no such buffer; push-to-talk needs one.
 */
const PRE_ROLL_MS = 300;

/**
 * Hard ceiling on a single capture, in seconds. This is a runaway guard, not a
 * conversational limit - normal use never reaches it (the kid releases or taps
 * stop). It only bounds a mic left open, e.g. a forgotten hands-free recording,
 * so the buffer can't grow without end (~11MB/min) and we never hand Whisper an
 * enormous clip. When hit, capture stops and `onLimitReached` fires so the owner
 * can transcribe whatever was gathered.
 */
const MAX_CAPTURE_SECONDS = 120;

/**
 * Continuous microphone capture for push-to-talk. Opens the mic once and keeps a
 * short rolling pre-roll buffer of raw PCM; `beginCapture`/`endCapture` bracket
 * the kid's utterance and prepend the pre-roll. Capture runs in an AudioWorklet
 * (on the audio thread) so a busy main thread can't drop samples; frames arrive
 * as Float32 PCM (no webm/opus round-trip). The analyser feeds the waveform.
 */
export class MicRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private maxPreRoll = 0;
  private capturing = false;
  private captured: Float32Array[] = [];
  private capturedSamples = 0;
  private maxCaptureSamples = 0;
  private limitFired = false;
  /**
   * Fired once when a single capture hits MAX_CAPTURE_SECONDS, so the owner can
   * finish (transcribe what was gathered) for a mic that was left running.
   */
  onLimitReached: (() => void) | null = null;

  /** Opens the mic and starts buffering. Returns the analyser for the waveform. */
  async start(): Promise<AnalyserNode> {
    try {
      // Browser audio cleanup helps with messy kid audio (varying volume, noisy
      // rooms) - a deliberate divergence from desktop apps that leave it to the OS.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.stream = stream;

      const ctx = new AudioContext();
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(captureWorkletUrl);
      await ctx.resume().catch(() => {});
      this.maxPreRoll = Math.round((ctx.sampleRate * PRE_ROLL_MS) / 1000);
      this.maxCaptureSamples = Math.round(ctx.sampleRate * MAX_CAPTURE_SECONDS);

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      this.analyser = analyser;

      const node = new AudioWorkletNode(ctx, "hibit-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      node.port.onmessage = (event) => {
        // The frame was transferred to us, so we own it - no copy needed.
        const frame = event.data as Float32Array;
        if (this.capturing) {
          this.captured.push(frame);
          this.capturedSamples += frame.length;
          // Runaway guard: stop a capture that has run on too long and let the
          // owner finish with what we have.
          if (!this.limitFired && this.capturedSamples >= this.maxCaptureSamples) {
            this.limitFired = true;
            this.capturing = false;
            this.onLimitReached?.();
          }
          return;
        }
        this.preRoll.push(frame);
        this.preRollSamples += frame.length;
        while (this.preRollSamples > this.maxPreRoll && this.preRoll.length > 0) {
          const dropped = this.preRoll.shift();
          if (!dropped) break;
          this.preRollSamples -= dropped.length;
        }
      };
      source.connect(node);

      // The node must reach the destination to be processed, so route it through
      // a muted gain - the mic is never played back.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      node.connect(sink);
      sink.connect(ctx.destination);
      this.node = node;
      this.sink = sink;

      return analyser;
    } catch (error) {
      // start() acquired the mic but failed partway (e.g. addModule rejected):
      // release everything so the mic light doesn't stay on. The caller never
      // received the instance, so it can't clean up itself.
      this.stop();
      throw error;
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** Begins collecting the utterance, seeded with the buffered pre-roll. */
  beginCapture(): void {
    this.captured = [...this.preRoll];
    this.capturedSamples = this.preRollSamples;
    this.limitFired = false;
    this.capturing = true;
  }

  /** Stops collecting and returns the clip as 16kHz mono PCM. */
  endCapture(): Float32Array {
    this.capturing = false;
    const frames = this.captured;
    this.captured = [];
    this.capturedSamples = 0;
    return framesToMono16k(frames, this.ctx?.sampleRate ?? 48_000);
  }

  /** Tears down the mic and audio graph. Safe to call more than once. */
  stop(): void {
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
    }
    this.sink?.disconnect();
    this.analyser?.disconnect();
    void this.ctx?.close().catch(() => {});
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.node = null;
    this.sink = null;
    this.analyser = null;
    this.ctx = null;
    this.stream = null;
    this.preRoll = [];
    this.preRollSamples = 0;
    this.captured = [];
    this.capturedSamples = 0;
    this.capturing = false;
    this.limitFired = false;
    this.onLimitReached = null;
  }
}
