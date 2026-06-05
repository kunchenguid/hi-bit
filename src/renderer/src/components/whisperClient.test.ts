import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { data?: unknown; message?: string }) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners = new Map<string, Listener[]>();
  terminated = false;
  messages: unknown[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, event: { data?: unknown; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe("whisperClient", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.instances.length = 0;
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects all queued requests and starts fresh after worker errors", async () => {
    const { transcribeAudio, warmUpWhisper } = await import("./whisperClient");
    const warmup = warmUpWhisper();
    const transcription = transcribeAudio(new Float32Array([1]));

    FakeWorker.instances[0]?.emit("error", { message: "boom" });

    await expect(warmup).rejects.toThrow("boom");
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    await expect(Promise.race([transcription, Promise.resolve("still pending")])).rejects.toThrow(
      "boom",
    );

    const retry = warmUpWhisper();
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1]?.emit("message", { data: { id: 3, type: "ready" } });
    await expect(retry).resolves.toBeUndefined();
  });

  it("matches transcriptions to their request when warm-up finishes later", async () => {
    const { transcribeAudio, warmUpWhisper } = await import("./whisperClient");
    const warmup = warmUpWhisper();
    const transcription = transcribeAudio(new Float32Array([1]));

    FakeWorker.instances[0]?.emit("message", { data: { id: 2, type: "result", text: "hello" } });
    await expect(transcription).resolves.toBe("hello");

    FakeWorker.instances[0]?.emit("message", { data: { id: 1, type: "ready" } });
    await expect(warmup).resolves.toBeUndefined();
  });
});
