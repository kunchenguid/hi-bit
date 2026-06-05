import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { protocol } from "electron";
import type { VoiceModelService } from "./voiceModelService";

/**
 * The privileged scheme the renderer's Whisper worker loads model files over.
 * `secure` + `supportFetchAPI` let `fetch()` work from the worker; `standard`
 * gives it normal URL parsing (host + path) so transformers.js can join paths;
 * `corsEnabled` is required because the renderer's origin (the Vite dev server
 * or file://) differs from this scheme, making every load a cross-origin fetch.
 */
export const VOICE_MODEL_SCHEME = "hibit-model";

/** The base transformers.js uses as `env.localModelPath` (scheme + host). */
export const VOICE_MODEL_BASE = `${VOICE_MODEL_SCHEME}://model`;

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain",
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
}

/**
 * Must run before `app.ready` (Electron requires privileged schemes to be
 * registered up front). Pair with `handleVoiceModelProtocol` after ready.
 */
export function registerVoiceModelScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: VOICE_MODEL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Serves the on-disk Whisper model to the renderer worker. The model lives
 * under `userData/.hi-bit/models/`; the worker never reaches the network.
 * Requests are scoped to that dir by `resolveModelFile` (which rejects `..`),
 * so this cannot be turned into an arbitrary file reader. Files are streamed
 * (the ONNX weights are hundreds of MB) rather than buffered.
 */
export function handleVoiceModelProtocol(service: VoiceModelService): void {
  protocol.handle(VOICE_MODEL_SCHEME, async (request) => {
    try {
      const { pathname } = new URL(request.url);
      const filePath = service.resolveModelFile(pathname);
      const info = await stat(filePath);
      if (!info.isFile()) return new Response(null, { status: 404 });
      const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": contentTypeFor(filePath),
          "content-length": String(info.size),
          "access-control-allow-origin": "*",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
