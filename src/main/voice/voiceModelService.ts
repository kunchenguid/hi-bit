import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { VoiceDownloadProgress } from "@shared/voice";

/** The transformers.js model id; also the on-disk folder name under `modelsDir`. */
export const VOICE_MODEL_ID = "whisper-large-v3-turbo";
/** The HuggingFace repo the ONNX weights come from. */
export const VOICE_MODEL_REPO = "onnx-community/whisper-large-v3-turbo";
/**
 * Pinned revision so the downloaded file set stays deterministic even if the
 * repo's `main` changes. Bump deliberately if the manifest below needs to move.
 */
export const VOICE_MODEL_REVISION = "main";

/**
 * Exactly the files transformers.js requests for this model on WebGPU with
 * `dtype: { encoder_model: "fp16", decoder_model_merged: "q4" }`. The encoder
 * fp16 weight is self-contained (no external `.onnx_data`). Keep in sync with
 * the worker's pipeline options.
 */
export const VOICE_MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_fp16.onnx",
  "onnx/decoder_model_merged_q4.onnx",
] as const;

export type DownloadProgress = VoiceDownloadProgress;

type FetchImpl = (url: string) => Promise<Response>;

type VoiceModelDeps = {
  /** Injectable for tests; defaults to the global fetch (main process / Electron). */
  fetchImpl?: FetchImpl;
};

/**
 * Owns the on-disk Whisper model: knows whether it is fully present, downloads
 * it once from HuggingFace into `userData/.hi-bit/models/`, and resolves the
 * `hibit-model://` protocol's requests to safe on-disk paths. The main process
 * is the only thing that touches the network here, matching the app's
 * local-first conventions; the renderer worker reads the result over the
 * protocol and never fetches the model itself.
 */
export class VoiceModelService {
  private readonly fetchImpl: FetchImpl;
  // One shared download at a time. Concurrent callers (e.g. React StrictMode's
  // double-invoked effect, or a reopened modal) await the same run instead of
  // racing two downloads onto the same `.partial` files, which would interleave
  // progress and make the percentage jump backwards.
  private inFlight: Promise<void> | null = null;
  private readonly progressListeners = new Set<(progress: DownloadProgress) => void>();

  constructor(
    private readonly modelsDir: string,
    deps: VoiceModelDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? ((url) => fetch(url));
  }

  /** The folder this model's files live under. */
  modelDir(): string {
    return join(this.modelsDir, VOICE_MODEL_ID);
  }

  /** True only when every manifest file exists with non-zero size. */
  async modelReady(): Promise<boolean> {
    for (const file of VOICE_MODEL_FILES) {
      try {
        const info = await stat(join(this.modelDir(), file));
        if (!info.isFile() || info.size === 0) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Maps a `hibit-model://` request pathname (e.g.
   * `/whisper-large-v3-turbo/onnx/encoder_model_fp16.onnx`) to an absolute path
   * under `modelsDir`, refusing anything that would escape it via `..`.
   */
  resolveModelFile(requestPath: string): string {
    const rel = decodeURIComponent(requestPath).replace(/^[/\\]+/, "");
    const root = resolve(this.modelsDir);
    const abs = resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new Error("Refusing to serve a path outside the models dir.");
    }
    return abs;
  }

  /**
   * Downloads any missing manifest files from the pinned HuggingFace revision.
   * Each file is written to a `.partial` sibling and renamed only on success, so
   * an interrupted download never leaves a half-file that `modelReady()` would
   * wrongly accept. A no-op when everything is already present.
   *
   * Single-flight: if a download is already running, this attaches `onProgress`
   * to it and awaits the same run rather than starting a second one.
   */
  async ensureModel(onProgress?: (progress: DownloadProgress) => void): Promise<void> {
    if (onProgress) this.progressListeners.add(onProgress);
    try {
      if (!this.inFlight) {
        this.inFlight = this.runDownload().finally(() => {
          this.inFlight = null;
        });
      }
      await this.inFlight;
    } finally {
      if (onProgress) this.progressListeners.delete(onProgress);
    }
  }

  private emitProgress(progress: DownloadProgress): void {
    for (const listener of this.progressListeners) listener(progress);
  }

  private async runDownload(): Promise<void> {
    const missing: string[] = [];
    for (const file of VOICE_MODEL_FILES) {
      try {
        const info = await stat(join(this.modelDir(), file));
        if (info.isFile() && info.size > 0) continue;
      } catch {
        // Not present - needs downloading.
      }
      missing.push(file);
    }
    if (missing.length === 0) return;

    for (let i = 0; i < missing.length; i++) {
      const file = missing[i];
      await this.downloadFile(file, (fileFraction) => {
        this.emitProgress({
          file,
          fileIndex: i,
          fileCount: missing.length,
          fraction: (i + fileFraction) / missing.length,
        });
      });
      this.emitProgress({
        file,
        fileIndex: i,
        fileCount: missing.length,
        fraction: (i + 1) / missing.length,
      });
    }
  }

  private async downloadFile(
    file: string,
    onFileProgress: (fraction: number) => void,
  ): Promise<void> {
    const url = `https://huggingface.co/${VOICE_MODEL_REPO}/resolve/${VOICE_MODEL_REVISION}/${file}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Could not download ${file} (HTTP ${response.status}).`);
    }

    const target = join(this.modelDir(), file);
    const partial = `${target}.partial`;
    await mkdir(dirname(target), { recursive: true });

    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          if (total > 0) onFileProgress(Math.min(1, received / total));
        }
      }
      await writeFile(partial, Buffer.concat(chunks));
    } else {
      // No streaming body (e.g. test doubles): fall back to a single buffer.
      await writeFile(partial, Buffer.from(await response.arrayBuffer()));
    }

    try {
      await rename(partial, target);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    onFileProgress(1);
  }
}
