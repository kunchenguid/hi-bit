// AudioWorklet processor: forwards mono microphone frames to the main thread
// from the audio thread, so capture never drops samples when the UI is busy
// (the waveform animation, React, GC). It batches into ~1024-sample chunks and
// transfers them (zero-copy) to keep message volume low.
//
// Plain JS on purpose: AudioWorklet modules load as classic scripts via
// `audioWorklet.addModule`, and the file is referenced with Vite's `?url` so it
// is emitted verbatim (works under both the dev server and the packaged file://
// renderer). It is intentionally outside the TypeScript program.
const CHUNK_SIZE = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_SIZE);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.offset++] = channel[i];
        if (this.offset === CHUNK_SIZE) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(CHUNK_SIZE);
          this.offset = 0;
        }
      }
    }
    return true; // keep the processor alive for the next block
  }
}

registerProcessor("hibit-capture", CaptureProcessor);
