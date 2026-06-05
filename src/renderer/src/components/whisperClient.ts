import type { WhisperRequest, WhisperResponse } from "./voiceInput";

/**
 * A thin wrapper over the Whisper Web Worker. The worker is created lazily and
 * kept alive across opens so the (expensive) WebGPU pipeline load only happens
 * once per session.
 */
let worker: Worker | null = null;

type Pending = { resolve: (text: string) => void; reject: (error: Error) => void };
type WhisperRequestPayload = { type: "init" } | { type: "transcribe"; audio: Float32Array };
const pendingRequests = new Map<number, Pending>();
let nextRequestId = 1;

function rejectAll(error: Error): void {
  for (const pending of pendingRequests.values()) pending.reject(error);
  pendingRequests.clear();
}

function resetWorker(error: Error): void {
  worker?.terminate();
  worker = null;
  rejectAll(error);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const next = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  next.addEventListener("message", (event: MessageEvent<WhisperResponse>) => {
    const message = event.data;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.type === "error") pending.reject(new Error(message.message));
    else if (message.type === "result") pending.resolve(message.text);
    else pending.resolve(""); // "ready"
  });
  next.addEventListener("error", (event) => {
    resetWorker(new Error(event.message || "The voice helper stopped working."));
  });
  worker = next;
  return next;
}

function send(message: WhisperRequestPayload): Promise<string> {
  const active = ensureWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    active.postMessage({ ...message, id });
  });
}

/** Loads the model and primes WebGPU once per worker. Safe to call repeatedly. */
export function warmUpWhisper(): Promise<void> {
  return send({ type: "init" }).then(() => undefined);
}

/** Transcribes 16kHz mono PCM to text. */
export function transcribeAudio(audio: Float32Array): Promise<string> {
  return send({ type: "transcribe", audio });
}
