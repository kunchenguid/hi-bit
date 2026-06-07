import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { extractCodexAccountId } from "../auth/codexOAuth";

/**
 * Clean-room `generate_image` bot tool.
 *
 * Bots build kids' web apps; this lets a bot make a raster asset (sprite,
 * icon, background) and drop it straight into the creation's Workbench. It reuses
 * Hi-Bit's own Codex login: a fresh access token plus the account id we already
 * decode for OAuth. The request goes to the Codex Responses backend with the
 * native `image_generation` tool, which the backend fulfils with gpt-image-2.
 *
 * The result deliberately stays small (a text note with the saved path); the
 * base64 image is written to disk, never returned as tool content, so creation
 * logbooks do not balloon with megabytes of image data.
 */

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
/** Matches the originator the Codex OAuth token was minted for (see codexOAuth.ts). */
const ORIGINATOR = "codex_cli_rs";
const DEFAULT_MODEL = "gpt-5.5";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;

const OUTPUT_FORMATS = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp" } as const;
type OutputFormat = "png" | "jpeg" | "webp";

/** Image mime type for a reference file's extension, for the input_image data URL. */
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const TOOL_PARAMS = Type.Object({
  prompt: Type.String({
    description:
      "What to draw. Be specific about subject, style (e.g. pixel art, cartoon), colors, and size.",
  }),
  fileName: Type.String({
    description:
      "Where to save the image inside the creation, as a relative path like 'images/dragon.png'. The extension sets the format (png, jpeg, or webp).",
  }),
  reference_paths: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional pictures to steer the art direction (style, colors, character look). Each entry is either the id of a picture the builder shared (given to you in the job) or a relative path to an image already in this creation. The generator looks at them and matches their look.",
    }),
  ),
});

type ToolParams = { prompt: string; fileName: string; reference_paths?: string[] };

/** A reference picture resolved to a readable file plus its image mime type. */
type ReferenceTarget = { path: string; mimeType: string };

/** One `input_image` content block the Codex backend conditions generation on. */
type ImageContentBlock = { type: "input_image"; image_url: string };

export type GenerateImageToolDeps = {
  /** Returns a current Codex access token; Hi-Bit refreshes it when expiring. */
  getFreshAccessToken: () => Promise<string>;
  /** Codex routing model that invokes image generation. Defaults to gpt-5.5. */
  model?: string;
  /**
   * Resolves a `reference_paths` entry that names a job reference (a picture the
   * builder shared, stored at factory level) to its on-disk file. `cwd` is the
   * bot's Workbench, so the resolver can scope references to the running job.
   * Returns undefined for anything it doesn't own, and the entry is then read as
   * a Workbench-relative path instead.
   */
  resolveReference?: (cwd: string, ref: string) => ReferenceTarget | undefined;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  /** Injectable backoff for tests. */
  sleep?: (ms: number) => Promise<void>;
};

type ToolCtx = { cwd: string };

type ParsedResponse = {
  imageBase64?: string;
  revisedPrompt?: string;
  text: string[];
};

function outputFormatFor(fileName: string): OutputFormat {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return OUTPUT_FORMATS[ext as keyof typeof OUTPUT_FORMATS] ?? "png";
}

/** Resolves the save path under cwd, rejecting anything that escapes the Workbench. */
function resolveTarget(cwd: string, fileName: string): string {
  const target = resolve(cwd, fileName);
  const rel = relative(cwd, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("The image must be saved inside the creation, not outside it.");
  }
  return target;
}

/**
 * Resolves a `reference_paths` entry to a readable file: first as a named job
 * reference (the builder's picture, factory-level), otherwise as a Workbench
 * file. Workbench paths use the same escape guard as the save target so a bot
 * can't read outside the creation.
 */
function resolveReferenceTarget(
  cwd: string,
  ref: string,
  resolveReference?: GenerateImageToolDeps["resolveReference"],
): ReferenceTarget {
  const known = resolveReference?.(cwd, ref);
  if (known) return known;

  const target = resolve(cwd, ref);
  const rel = relative(cwd, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("A reference image must be inside the creation, not outside it.");
  }
  const ext = ref.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error("A reference file must be a supported image: png, jpg, jpeg, webp, or gif.");
  }
  return { path: target, mimeType };
}

/** Reads each reference picture and turns it into an `input_image` content block. */
async function buildReferenceBlocks(
  cwd: string,
  referencePaths: string[] | undefined,
  resolveReference?: GenerateImageToolDeps["resolveReference"],
): Promise<ImageContentBlock[]> {
  if (!referencePaths?.length) return [];
  const blocks: ImageContentBlock[] = [];
  for (const ref of referencePaths) {
    const { path, mimeType } = resolveReferenceTarget(cwd, ref, resolveReference);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      throw new Error(`Could not read the reference image "${ref}".`);
    }
    if (size > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(`The reference image "${ref}" is too large. Use an image under 5 MB.`);
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new Error(`Could not read the reference image "${ref}".`);
    }
    blocks.push({
      type: "input_image",
      image_url: `data:${mimeType};base64,${bytes.toString("base64")}`,
    });
  }
  return blocks;
}

function buildRequestBody(
  prompt: string,
  model: string,
  outputFormat: OutputFormat,
  referenceBlocks: ImageContentBlock[],
) {
  return {
    model,
    stream: true,
    store: false,
    instructions:
      "You are generating one bitmap image asset. Call the image_generation tool exactly once and do not reply with text instead.",
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...referenceBlocks] }],
    tools: [{ type: "image_generation", output_format: outputFormat }],
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
}

function parseSseChunk(chunk: string, parsed: ParsedResponse): void {
  const data = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (event.type) {
    case "error":
      throw new Error(`Codex error: ${String(event.message ?? event.code ?? "unknown")}`);
    case "response.failed": {
      const message = (event.response as { error?: { message?: string } } | undefined)?.error
        ?.message;
      throw new Error(message ?? "Codex could not finish the image.");
    }
    case "response.output_text.delta": {
      if (typeof event.delta === "string") parsed.text.push(event.delta);
      break;
    }
    case "response.output_item.done": {
      const item = event.item as
        | { type?: string; result?: string; revised_prompt?: string }
        | undefined;
      if (item?.type === "image_generation_call" && typeof item.result === "string") {
        parsed.imageBase64 = item.result;
        if (typeof item.revised_prompt === "string") parsed.revisedPrompt = item.revised_prompt;
      }
      break;
    }
  }
}

async function parseSse(response: Response, signal?: AbortSignal): Promise<ParsedResponse> {
  if (!response.body) throw new Error("Codex returned no image stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parsed: ParsedResponse = { text: [] };
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Image generation was stopped.");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        parseSseChunk(buffer.slice(0, boundary), parsed);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) parseSseChunk(buffer, parsed);
  } finally {
    reader.releaseLock();
  }
  return parsed;
}

export function createGenerateImageTool(deps: GenerateImageToolDeps): ToolDefinition {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const model = deps.model ?? DEFAULT_MODEL;

  return defineTool({
    name: "generate_image",
    label: "Generate image",
    description:
      "Draw a picture (sprite, icon, background, illustration) and save it into the creation. Use it when the builder wants real art in their app. Pass reference_paths to steer the look from pictures the builder shared or art already in the creation. It uses the connected Codex account and costs image quota, so only call it for a clear picture request.",
    parameters: TOOL_PARAMS,
    executionMode: "parallel",
    async execute(_callId, rawParams, signal, _onUpdate, ctx) {
      const params = rawParams as ToolParams;
      const cwd = (ctx as ToolCtx).cwd;
      const outputFormat = outputFormatFor(params.fileName);
      const target = resolveTarget(cwd, params.fileName);
      // Read any reference pictures up front so a bad path fails before we spend
      // a Codex image call.
      const referenceBlocks = await buildReferenceBlocks(
        cwd,
        params.reference_paths,
        deps.resolveReference,
      );

      const token = await deps.getFreshAccessToken();
      const accountId = extractCodexAccountId(token);
      if (!accountId) {
        throw new Error("Could not read the Codex account. Reconnect Codex and try again.");
      }

      const body = JSON.stringify(
        buildRequestBody(params.prompt, model, outputFormat, referenceBlocks),
      );
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId,
        originator: ORIGINATOR,
        "OpenAI-Beta": "responses=experimental",
        accept: "text/event-stream",
        "content-type": "application/json",
      };

      let parsed: ParsedResponse | undefined;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        if (signal?.aborted) throw new Error("Image generation was stopped.");
        const response = await fetchFn(CODEX_RESPONSES_URL, {
          method: "POST",
          headers,
          body,
          signal,
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          if (attempt < MAX_RETRIES && RETRYABLE_STATUS.has(response.status)) {
            await sleep(1000 * 2 ** attempt);
            continue;
          }
          throw new Error(`Codex image request failed (${response.status}): ${errorText}`.trim());
        }
        parsed = await parseSse(response, signal);
        break;
      }

      if (!parsed?.imageBase64) {
        const note = parsed?.text.join("").trim();
        throw new Error(
          note
            ? `Codex did not return an image. It said: ${note}`
            : "Codex did not return an image. Try rephrasing the picture.",
        );
      }

      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(parsed.imageBase64, "base64"));

      const relPath = relative(cwd, target);
      const summary = parsed.revisedPrompt
        ? `Saved a new image to ${relPath}. (Drawn from: ${parsed.revisedPrompt})`
        : `Saved a new image to ${relPath}.`;

      return {
        content: [{ type: "text", text: summary }],
        details: { savedPath: relPath, outputFormat, model, backendImageModel: "gpt-image-2" },
      };
    },
  });
}
