import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VOICE_MODEL_FILES, VOICE_MODEL_ID, VoiceModelService } from "./voiceModelService";

async function tempModelsDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-voice-"));
}

/** Writes every manifest file under the model dir so modelReady() passes. */
async function seedCompleteModel(modelsDir: string): Promise<void> {
  for (const file of VOICE_MODEL_FILES) {
    const target = join(modelsDir, VOICE_MODEL_ID, file);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "x");
  }
}

describe("VoiceModelService.modelReady", () => {
  it("is false on an empty dir", async () => {
    const service = new VoiceModelService(await tempModelsDir());
    expect(await service.modelReady()).toBe(false);
  });

  it("is false when a single manifest file is missing", async () => {
    const dir = await tempModelsDir();
    await seedCompleteModel(dir);
    // Drop one required file by truncating it to zero bytes.
    await writeFile(join(dir, VOICE_MODEL_ID, VOICE_MODEL_FILES[0]), "");
    const service = new VoiceModelService(dir);
    expect(await service.modelReady()).toBe(false);
  });

  it("is true once every manifest file exists with content", async () => {
    const dir = await tempModelsDir();
    await seedCompleteModel(dir);
    const service = new VoiceModelService(dir);
    expect(await service.modelReady()).toBe(true);
  });
});

describe("VoiceModelService.resolveModelFile", () => {
  it("maps a protocol pathname to a path under the models dir", async () => {
    const dir = await tempModelsDir();
    const service = new VoiceModelService(dir);
    expect(service.resolveModelFile("/whisper-large-v3-turbo/onnx/encoder_model_fp16.onnx")).toBe(
      join(dir, "whisper-large-v3-turbo", "onnx", "encoder_model_fp16.onnx"),
    );
  });

  it("rejects parent-directory traversal that escapes the models dir", async () => {
    const service = new VoiceModelService(await tempModelsDir());
    expect(() => service.resolveModelFile("/../../etc/passwd")).toThrow();
    expect(() => service.resolveModelFile("/whisper/../../secret")).toThrow();
  });
});

describe("VoiceModelService.ensureModel", () => {
  it("downloads missing files, reports progress, and becomes ready", async () => {
    const dir = await tempModelsDir();
    const fetchImpl = vi.fn(async (url: string) => {
      return new Response(`bytes:${url}`, {
        status: 200,
        headers: { "content-length": "8" },
      });
    });
    const service = new VoiceModelService(dir, { fetchImpl });
    const progress: number[] = [];

    await service.ensureModel((p) => progress.push(p.fraction));

    expect(await service.modelReady()).toBe(true);
    // Every manifest file was fetched from the pinned HuggingFace revision.
    expect(fetchImpl).toHaveBeenCalledTimes(VOICE_MODEL_FILES.length);
    expect(fetchImpl.mock.calls[0][0]).toContain("huggingface.co");
    // Progress ends at fully complete.
    expect(progress.at(-1)).toBe(1);
  });

  it("skips files already present on disk", async () => {
    const dir = await tempModelsDir();
    await seedCompleteModel(dir);
    const fetchImpl = vi.fn();
    const service = new VoiceModelService(dir, { fetchImpl });

    await service.ensureModel();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs a single shared download when called concurrently", async () => {
    const dir = await tempModelsDir();
    // Each fetch resolves on the next microtask, so two overlapping ensureModel
    // calls would both enter the loop if it were not single-flight.
    const fetchImpl = vi.fn(async (url: string) => {
      await Promise.resolve();
      return new Response(`bytes:${url}`, { status: 200 });
    });
    const service = new VoiceModelService(dir, { fetchImpl });

    await Promise.all([service.ensureModel(), service.ensureModel(), service.ensureModel()]);

    // Each manifest file is fetched exactly once despite three callers.
    expect(fetchImpl).toHaveBeenCalledTimes(VOICE_MODEL_FILES.length);
    expect(await service.modelReady()).toBe(true);
  });

  it("does not leave a partial file behind when a download fails", async () => {
    const dir = await tempModelsDir();
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const service = new VoiceModelService(dir, { fetchImpl });

    await expect(service.ensureModel()).rejects.toThrow();
    expect(await service.modelReady()).toBe(false);
    // The first target must not exist as a finished file.
    await expect(
      readFile(join(dir, VOICE_MODEL_ID, VOICE_MODEL_FILES[0]), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
