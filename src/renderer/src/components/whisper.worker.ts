/// <reference types="vite/client" />
import { env, pipeline } from "@huggingface/transformers";
// ORT's WebGPU build loads the asyncify wasm; we serve it locally (CSP blocks
// ORT's default CDN). These are copied in by scripts/copy-ort-assets.mjs.
import asyncifyMjsUrl from "../generated/ort/ort-wasm-simd-threaded.asyncify.mjs?url";
import asyncifyWasmUrl from "../generated/ort/ort-wasm-simd-threaded.asyncify.wasm?url";
import type { WhisperRequest, WhisperResponse } from "./voiceInput";

// Load the model only from the main process's on-disk copy, served over the
// hibit-model:// protocol - never the network.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "hibit-model://model";
env.useBrowserCache = false;
// Skip transformers' wasm pre-fetch+blob caching: we point ORT straight at the
// locally-bundled wasm/mjs so no blob: script eval is needed.
env.useWasmCache = false;

const onnxWasm = env.backends.onnx.wasm as {
  numThreads: number;
  proxy: boolean;
  wasmPaths: unknown;
};
// Single-threaded keeps us off SharedArrayBuffer (no cross-origin isolation)
// and avoids spawning blob-URL workers; WebGPU does the heavy lifting anyway.
onnxWasm.numThreads = 1;
onnxWasm.proxy = false;
onnxWasm.wasmPaths = { wasm: asyncifyWasmUrl, mjs: asyncifyMjsUrl };

const MODEL_ID = "whisper-large-v3-turbo";
const SAMPLE_RATE = 16_000;

// Whisper's native window is 30s; chunking lets us transcribe longer clips by
// sliding 30s windows with a 5s overlap and stitching the pieces (timestamps
// are required for the stitch). Without this, audio past 30s is silently cut.
const TRANSCRIBE_OPTIONS = {
  chunk_length_s: 30,
  stride_length_s: 5,
  return_timestamps: true as const,
};

// biome-ignore lint/suspicious/noExplicitAny: transformers' pipeline type is broad; we only call it.
let asrPromise: Promise<any> | null = null;

function getAsr() {
  if (!asrPromise) {
    asrPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "webgpu",
      dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
    });
  }
  return asrPromise;
}

const ctx = self as unknown as {
  postMessage(message: WhisperResponse): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WhisperRequest>) => void): void;
};

ctx.addEventListener("message", async (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      const asr = await getAsr();
      // Warm-up: one pass on 0.5s of silence compiles the WebGPU shaders now, so
      // the kid's first real transcription isn't several times slower. Errors
      // here are harmless - it's only priming.
      try {
        await asr(new Float32Array(SAMPLE_RATE / 2), TRANSCRIBE_OPTIONS);
      } catch {
        // Priming failed; the real call will surface any genuine problem.
      }
      ctx.postMessage({ type: "ready" });
      return;
    }
    if (message.type === "transcribe") {
      const asr = await getAsr();
      const output = await asr(message.audio, TRANSCRIBE_OPTIONS);
      const text = (Array.isArray(output) ? output[0]?.text : output?.text) ?? "";
      ctx.postMessage({ type: "result", text: String(text).trim() });
      return;
    }
  } catch (error) {
    ctx.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
