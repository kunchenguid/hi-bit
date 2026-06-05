import type { WhisperRequest, WhisperResponse } from "./voiceInput";

/**
 * A thin wrapper over the Whisper Web Worker. The worker is created lazily and
 * kept alive across opens so the (expensive) WebGPU pipeline load only happens
 * once per session. Requests are serialized by the UI, so responses are matched
 * to callers FIFO - the worker replies exactly once, in order, per request.
 */
let worker: Worker | null = null;

type Pending = { resolve: (text: string) => void; reject: (error: Error) => void };
const queue: Pending[] = [];

function ensureWorker(): Worker {
  if (worker) return worker;
  const next = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  next.addEventListener("message", (event: MessageEvent<WhisperResponse>) => {
    const message = event.data;
    const pending = queue.shift();
    if (!pending) return;
    if (message.type === "error") pending.reject(new Error(message.message));
    else if (message.type === "result") pending.resolve(message.text);
    else pending.resolve(""); // "ready"
  });
  next.addEventListener("error", (event) => {
    queue.shift()?.reject(new Error(event.message || "The voice helper stopped working."));
  });
  worker = next;
  return next;
}

function send(message: WhisperRequest): Promise<string> {
  const active = ensureWorker();
  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject });
    active.postMessage(message);
  });
}

/** Loads the model into WebGPU. Safe to call repeatedly; only the first loads. */
export function warmUpWhisper(): Promise<void> {
  return send({ type: "init" }).then(() => undefined);
}

/** Transcribes 16kHz mono PCM to text. */
export function transcribeAudio(audio: Float32Array): Promise<string> {
  return send({ type: "transcribe", audio });
}
