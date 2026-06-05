// Copies the onnxruntime-web WASM files that transformers.js needs for WebGPU
// into a generated dir the renderer worker imports with `?url`. ORT's package
// `exports` map blocks deep `dist/*` imports, so we can't `import` them directly;
// and CSP blocks ORT's default jsdelivr CDN, so they must be served from `self`.
//
// Vite resolves `?url` imports to URLs that work in both dev (localhost) and the
// packaged file:// renderer, which a `public/` root-absolute path would not.
//
// transformers.js 4.x (`onnxruntime-web/webgpu`) loads the *asyncify* build on
// non-Safari (which Electron always is); see node_modules/@huggingface/
// transformers/src/backends/onnx.js. Keep this list in sync if that changes.
import { createRequire } from "node:module";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.mjs"];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// onnxruntime-web is a (non-hoisted, pnpm) dependency of @huggingface/transformers
// and neither package exposes `./package.json` via its `exports` map, so resolve
// ORT's main entry from transformers' own resolution context and walk to `dist`.
const require = createRequire(import.meta.url);
const fromTransformers = createRequire(require.resolve("@huggingface/transformers"));
const ortDist = dirname(fromTransformers.resolve("onnxruntime-web"));
const outDir = join(repoRoot, "src", "renderer", "src", "generated", "ort");

await mkdir(outDir, { recursive: true });
for (const file of FILES) {
  await cp(join(ortDist, file), join(outDir, file));
}
console.log(`[hi-bit] copied ${FILES.length} onnxruntime-web asset(s) to ${outDir}`);
