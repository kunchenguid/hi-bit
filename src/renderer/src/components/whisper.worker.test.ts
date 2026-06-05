import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: { data: unknown }) => void;

const pipeline = vi.fn();

vi.mock("@huggingface/transformers", () => ({
  env: {
    backends: { onnx: { wasm: {} } },
    allowRemoteModels: true,
    allowLocalModels: false,
    localModelPath: "",
    useBrowserCache: true,
    useWasmCache: true,
  },
  pipeline,
}));

vi.mock("../generated/ort/ort-wasm-simd-threaded.asyncify.mjs?url", () => ({
  default: "/ort-wasm-simd-threaded.asyncify.mjs",
}));

vi.mock("../generated/ort/ort-wasm-simd-threaded.asyncify.wasm?url", () => ({
  default: "/ort-wasm-simd-threaded.asyncify.wasm",
}));

describe("whisper.worker", () => {
  let listener: Listener | undefined;
  const posted: unknown[] = [];

  beforeEach(async () => {
    vi.resetModules();
    pipeline.mockReset();
    listener = undefined;
    posted.length = 0;
    vi.stubGlobal("self", {
      addEventListener: (_type: "message", nextListener: Listener) => {
        listener = nextListener;
      },
      postMessage: (message: unknown) => {
        posted.push(message);
      },
    });
    await import("./whisper.worker");
  });

  it("retries model loading after an initialization failure", async () => {
    const failedLoad = Promise.reject(new Error("model unavailable"));
    pipeline.mockReturnValueOnce(failedLoad);

    listener?.({ data: { type: "init" } });
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: "error", message: "model unavailable" });
    });

    const asr = vi.fn().mockResolvedValue({ text: "hello" });
    pipeline.mockResolvedValueOnce(asr);

    listener?.({ data: { type: "transcribe", audio: new Float32Array([1]) } });

    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: "result", text: "hello" });
    });
    expect(pipeline).toHaveBeenCalledTimes(2);
  });

  it("runs the warm-up inference only once across repeated init calls", async () => {
    const asr = vi.fn().mockResolvedValue({ text: "" });
    pipeline.mockResolvedValue(asr);

    listener?.({ data: { type: "init" } });
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: "ready" });
    });

    posted.length = 0;
    listener?.({ data: { type: "init" } });
    await vi.waitFor(() => {
      expect(posted).toContainEqual({ type: "ready" });
    });

    // The model loads once (pipeline cached) and the priming pass runs once;
    // a second init still reports ready without re-inferring on silence.
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(asr).toHaveBeenCalledTimes(1);
  });
});
