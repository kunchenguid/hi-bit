import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { isIP, type LookupFunction } from "node:net";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { Type } from "typebox";
import { extractCodexAccountId } from "../auth/codexOAuth";
import type { PersistImage } from "./persistImage";

/**
 * Web-access tools shared by bots and Bit.
 *
 * Bots build kids' web apps and Bit coordinates them, and both sometimes need to
 * look something up - current library/API docs, an example, a reference page.
 * Three tools cover that with no third-party dependency:
 *
 * - `web_search` reuses Hi-Bit's own Codex login. It calls the Codex Responses
 *   backend with the native `web_search` hosted tool (the same backend + token
 *   the `generate_image` tool uses), so search runs on the parent's existing
 *   ChatGPT connection - nothing goes to an outside search service. It defaults
 *   to Codex's cached index (no live page fetching), which keeps the
 *   prompt-injection surface small for a young audience; pass `live: true` to
 *   fetch fresh pages.
 * - `fetch_content` pulls a page Bit or a bot already has the URL for and turns
 *   the readable article into markdown locally (Readability + turndown), so only
 *   the URL leaves the machine. Long pages are parked in an in-memory store and
 *   handed back as an id (`get_search_content`) so a creation's logbook never
 *   balloons with raw page dumps.
 */

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
/** Matches the originator the Codex OAuth token was minted for (see codexOAuth.ts). */
const ORIGINATOR = "codex_cli_rs";
const DEFAULT_MODEL = "gpt-5.5";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const DEFAULT_STORE_THRESHOLD = 30_000;
const MAX_STORED = 50;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_FETCH_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;
const HTML_ACCEPT = "text/html,application/xhtml+xml";
/** search_image accepts images first but still lets pages through for og:image fallback. */
const IMAGE_ACCEPT = "image/*,text/html;q=0.9,*/*;q=0.8";
/**
 * A real browser User-Agent. Many image CDNs and hotlink-protected hosts reject
 * requests that send no UA (or an obvious bot UA) with a 403 or an HTML error
 * page, which would make search_image silently skip otherwise-good pictures.
 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/** Cap a single downloaded picture; gpt-5.5 vision tops out around 2.5MP at high detail. */
const MAX_IMAGE_BYTES = 6_000_000;
/**
 * Downscale a picture so its longest edge is at most this many pixels before the
 * model sees it. gpt-5.5 vision already downsamples to ~2.5MP / 2048px and tiles
 * at a 768px short side, so anything larger is bytes in the transcript for no
 * perceptual gain. 1024px keeps a look (and any in-image text) clear.
 */
const MAX_IMAGE_EDGE = 1024;
/** JPEG quality (0-100) for the re-encoded downscale; ~80 is plenty for "what does it look like". */
const DOWNSCALE_JPEG_QUALITY = 80;
/** Mimes gpt-5.5 vision can actually read. SVG and others are skipped. */
const VISION_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const MAX_IMAGE_CANDIDATES = 8;
const DEFAULT_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 3;
/** Wall-clock budget for downloading candidate pictures, so a kid never waits minutes. */
const IMAGE_DOWNLOAD_BUDGET_MS = 30_000;

export type WebSearchToolDeps = {
  /** Returns a current Codex access token; Hi-Bit refreshes it when expiring. */
  getFreshAccessToken: () => Promise<string>;
  /** Codex routing model. Defaults to gpt-5.5. */
  model?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable backoff for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Codex Responses endpoint; overridable for tests. */
  responsesUrl?: string;
  /** Inline-vs-store cutoff in characters. */
  storeThreshold?: number;
  lookupHost?: (hostname: string) => Promise<string[]>;
  maxFetchBytes?: number;
  /**
   * Persists each `search_image` result into the profile's image store and
   * returns a reusable id. Omitted in tests (and when no store is wired), so
   * search still works but pictures are not durable.
   */
  persistImage?: PersistImage;
};

/** The execution context the Pi runtime hands every tool; `cwd` is the session's working dir. */
type ToolCtx = { cwd?: string };

type ToolResultPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type ToolResult = {
  content: ToolResultPart[];
  details: Record<string, unknown> | undefined;
};

// ---- shared content store ---------------------------------------------------

type StoreEntry = { id: string; text: string; createdAt: number };

function createStore() {
  const entries = new Map<string, StoreEntry>();
  return {
    save(text: string): string {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      entries.set(id, { id, text, createdAt: Date.now() });
      while (entries.size > MAX_STORED) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return id;
    },
    get(id: string): string | null {
      return entries.get(id)?.text ?? null;
    },
  };
}

// ---- Codex-native web search ------------------------------------------------

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

type WebSearchParse = {
  answer: string;
  queries: string[];
  citations: string[];
};

/** A single web_search tool entry for the Responses request. */
function webSearchToolSpec(live: boolean, domains?: string[]) {
  const allowed = (domains ?? []).map((d) => d.trim().replace(/^https?:\/\//, "")).filter(Boolean);
  return {
    type: "web_search" as const,
    external_web_access: live,
    ...(allowed.length ? { filters: { allowed_domains: allowed } } : {}),
  };
}

function buildWebSearchBody(query: string, model: string, live: boolean, domains?: string[]) {
  return {
    model,
    stream: true,
    store: false,
    instructions:
      "Use the web_search tool to find current, accurate information, then answer briefly and include the source URLs you used.",
    input: [{ role: "user", content: [{ type: "input_text", text: query }] }],
    tools: [webSearchToolSpec(live, domains)],
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
}

function parseWebSearchChunk(chunk: string, parsed: WebSearchParse): void {
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
      throw new Error(message ?? "Codex could not finish the search.");
    }
    case "response.output_text.delta": {
      if (typeof event.delta === "string") parsed.answer += event.delta;
      break;
    }
    case "response.output_item.done": {
      const item = event.item as
        | {
            type?: string;
            action?: { query?: string; queries?: string[] };
            content?: Array<{
              text?: string;
              annotations?: Array<{ type?: string; url?: string }>;
            }>;
          }
        | undefined;
      if (item?.type === "web_search_call") {
        const queries = item.action?.queries ?? (item.action?.query ? [item.action.query] : []);
        for (const q of queries) if (q) parsed.queries.push(q);
      }
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (typeof part.text === "string" && part.text.trim()) parsed.answer = part.text;
          for (const annotation of part.annotations ?? []) {
            if (annotation.type === "url_citation" && annotation.url)
              parsed.citations.push(annotation.url);
          }
        }
      }
      break;
    }
  }
}

async function parseWebSearchSse(
  response: Response,
  signal?: AbortSignal,
): Promise<WebSearchParse> {
  if (!response.body) throw new Error("Codex returned no search stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parsed: WebSearchParse = { answer: "", queries: [], citations: [] };
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Search was stopped.");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        parseWebSearchChunk(buffer.slice(0, boundary), parsed);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) parseWebSearchChunk(buffer, parsed);
  } finally {
    reader.releaseLock();
  }
  return parsed;
}

/** Codex auth headers shared by every Responses backend call (web_search + search_image). */
function codexHeaders(token: string, accountId: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "chatgpt-account-id": accountId,
    originator: ORIGINATOR,
    "OpenAI-Beta": "responses=experimental",
    accept: "text/event-stream",
    "content-type": "application/json",
  };
}

/** POST a Responses request to the Codex backend, retry transient failures, and parse the SSE. */
async function postCodexSearch(
  body: object,
  opts: {
    token: string;
    accountId: string;
    fetchFn: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    responsesUrl: string;
    signal?: AbortSignal;
  },
): Promise<WebSearchParse> {
  const headers = codexHeaders(opts.token, opts.accountId);
  const serialized = JSON.stringify(body);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (opts.signal?.aborted) throw new Error("Search was stopped.");
    const response = await opts.fetchFn(opts.responsesUrl, {
      method: "POST",
      headers,
      body: serialized,
      signal: requestSignal(opts.signal),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (attempt < MAX_RETRIES && RETRYABLE_STATUS.has(response.status)) {
        await opts.sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`Codex search failed (${response.status}): ${errorText}`.trim());
    }
    return await parseWebSearchSse(response, opts.signal);
  }
  throw new Error("Codex search failed.");
}

// ---- search_image: find image URLs, then download the pixels -----------------

/** Asks the model to browse and hand back direct, kid-appropriate image URLs. */
function buildImageSearchBody(query: string, model: string) {
  return {
    model,
    stream: true,
    store: false,
    instructions:
      "Use the web_search tool to find clear, kid-appropriate pictures of what the user describes. " +
      "Reply with a short list of direct image file URLs (links that end in .png, .jpg, .jpeg, .webp, or .gif), one per line. " +
      "If you only find web pages, list those page URLs instead. Never include anything not suitable for young children.",
    input: [{ role: "user", content: [{ type: "input_text", text: query }] }],
    tools: [webSearchToolSpec(true)],
    tool_choice: "auto",
    parallel_tool_calls: false,
  };
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/g;

function extractUrls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ""));
}

function isLikelyImageUrl(url: string): boolean {
  try {
    return /\.(png|jpe?g|webp|gif|bmp)$/.test(new URL(url).pathname.toLowerCase());
  } catch {
    return false;
  }
}

/** Picks a single concrete mime gpt-5.5 can read, by header then by file extension. */
function normalizeImageMime(contentType: string, url: URL): string | null {
  let mime = contentType.split(";")[0].trim().toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (VISION_MIME.has(mime)) return mime;
  const ext = url.pathname.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT_MIME[ext] ?? null;
}

function absolutize(value: string, base: URL): string | null {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

/** Pulls the best representative image off a page: og:image/twitter:image, else the first <img>. */
function extractImageFromHtml(html: string, base: URL): string | null {
  const { document } = parseHTML(html);
  const metaSelectors = [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
  ];
  for (const selector of metaSelectors) {
    const content = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (content) {
      const abs = absolutize(content, base);
      if (abs) return abs;
    }
  }
  const src = document.querySelector("img[src]")?.getAttribute("src")?.trim();
  return src ? absolutize(src, base) : null;
}

type ResolvedImage = { data: string; mimeType: string; source: string };

/**
 * The size to resize an image to so its longest edge is at most `maxEdge`,
 * preserving aspect ratio. Returns the original size when it already fits.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const nodeRequire = createRequire(import.meta.url);

/**
 * Shrinks an oversized picture before the model sees it: decode, resize so the
 * longest edge is `MAX_IMAGE_EDGE`, re-encode as JPEG. Returns null (keep the
 * original) when the image already fits, or when Electron can't decode the
 * format (webp/gif/svg) - those tend to be small already.
 *
 * Uses Electron's `nativeImage` (PNG/JPEG decode + resize, no extra dependency),
 * required lazily so the vitest node runtime never needs Electron.
 */
function downscaleImage(bytes: Uint8Array): { data: string; mimeType: string } | null {
  const { nativeImage } = nodeRequire("electron") as typeof import("electron");
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  const target = targetDimensions(width, height, MAX_IMAGE_EDGE);
  if (target.width === width && target.height === height) return null;
  const jpeg = image
    .resize({ width: target.width, height: target.height, quality: "good" })
    .toJPEG(DOWNSCALE_JPEG_QUALITY);
  if (jpeg.length === 0) return null;
  return { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
}

/**
 * Downloads a candidate URL through the SSRF-safe fetch path and returns base64 pixels.
 * If the URL is a web page (not an image), it hops once to that page's og:image/first <img>.
 */
async function fetchImageCandidate(
  rawUrl: string,
  deps: {
    fetchFn?: typeof fetch;
    lookupHost: (hostname: string) => Promise<string[]>;
    maxBytes: number;
    signal?: AbortSignal;
  },
  allowHtmlHop: boolean,
): Promise<ResolvedImage | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const response = await fetchWithSafeRedirects(
    url,
    deps.fetchFn,
    deps.lookupHost,
    deps.signal,
    IMAGE_ACCEPT,
  );
  if (response === null) return null;
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return null;
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.startsWith("image/")) {
    const bytes = await readResponseBytes(response, deps.maxBytes);
    if (bytes === null) return null;
    const mimeType = normalizeImageMime(contentType, url);
    if (mimeType === null) return null;
    let downscaled: { data: string; mimeType: string } | null = null;
    try {
      downscaled = downscaleImage(bytes);
    } catch {
      // A decode/encode hiccup must never lose the picture; fall back to the original.
    }
    if (downscaled) return { ...downscaled, source: rawUrl };
    return { data: Buffer.from(bytes).toString("base64"), mimeType, source: rawUrl };
  }

  if (allowHtmlHop && contentType.includes("html")) {
    const html = await readResponseText(response, deps.maxBytes);
    if (html === null) return null;
    const imageUrl = extractImageFromHtml(html, url);
    if (imageUrl === null) return null;
    return fetchImageCandidate(imageUrl, deps, false);
  }

  await response.body?.cancel().catch(() => {});
  return null;
}

// ---- HTML -> markdown (fetch_content) ---------------------------------------

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

function htmlToMarkdown(html: string): { title: string; markdown: string } {
  const { document } = parseHTML(html);
  const pageTitle = document.title?.trim() ?? "";
  // Readability mutates the document it parses, so keep a clean copy for fallback.
  const article = new Readability(document).parse();
  let markdown = article?.content ? turndown.turndown(article.content).trim() : "";
  if (!markdown) {
    const { document: fresh } = parseHTML(html);
    markdown = turndown.turndown(fresh.body?.innerHTML ?? html).trim();
  }
  return { title: article?.title?.trim() || pageTitle, markdown };
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function parseIpv4MappedIpv6(address: string): string | null {
  const normalized = address.toLowerCase();
  const dotted = normalized.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  const hexadecimal = normalized.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexadecimal) return null;
  const high = Number.parseInt(hexadecimal[1], 16);
  const low = Number.parseInt(hexadecimal[2], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = parseIpv4MappedIpv6(normalized);
  if (mappedIpv4 !== null) return isPrivateIpv4(mappedIpv4);
  const firstHextet = Number.parseInt(normalized.split(":", 1)[0], 16);
  if (!Number.isInteger(firstHextet)) return true;
  return (
    normalized === "::1" ||
    normalized === "::" ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xff00 && firstHextet <= 0xffff)
  );
}

function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function defaultLookupHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function validatePublicHttpUrl(
  url: URL,
  lookupHost: (hostname: string) => Promise<string[]>,
): Promise<string[] | null> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  const ipFamily = isIP(hostname);
  if (ipFamily) return isBlockedIp(hostname) ? null : [hostname];
  if (!hostname.includes(".")) return null;
  let addresses: string[];
  try {
    addresses = await lookupHost(hostname);
  } catch {
    return null;
  }
  return addresses.length > 0 && addresses.every((address) => !isBlockedIp(address))
    ? addresses
    : null;
}

function fetchUrlForAddress(url: URL, address: string): URL {
  const fetchUrl = new URL(url);
  if (!isIP(url.hostname) && isIP(address)) fetchUrl.hostname = address;
  return fetchUrl;
}

/**
 * Request headers shared by both fetch branches (raw-node and injected fetch).
 * `host` keeps the real hostname when we connect to a pinned IP; the browser
 * User-Agent stops image/CDN hosts from rejecting the request.
 */
export function outboundHeaders(accept: string, host: string): Record<string, string> {
  return { accept, host, "user-agent": BROWSER_USER_AGENT };
}

/**
 * A DNS lookup that always resolves to one pre-validated address (our SSRF pin),
 * so the socket connects to the exact IP we already checked.
 *
 * It must answer in whichever shape Node asked for: Node 24's default
 * `autoSelectFamily` calls a custom lookup in "all" mode and expects an array of
 * `{ address, family }`, while legacy single-address mode expects
 * `(err, address, family)`. Returning the legacy shape in "all" mode makes Node
 * read an undefined address and throw `ERR_INVALID_IP_ADDRESS`.
 */
export function pinnedLookup(address: string): LookupFunction {
  const family = (isIP(address) || 4) as 0 | 4 | 6;
  const lookup = (
    _hostname: string,
    options: { all?: boolean } | number,
    // biome-ignore lint/suspicious/noExplicitAny: node's lookup callback is overloaded (single vs all mode)
    callback: (...args: any[]) => void,
  ): void => {
    if (typeof options === "object" && options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
  return lookup as unknown as LookupFunction;
}

function nodeFetchWithAddress(
  url: URL,
  address: string,
  signal?: AbortSignal,
  accept: string = HTML_ACCEPT,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        headers: outboundHeaders(accept, url.host),
        lookup: pinnedLookup(address),
        signal: requestSignal(signal),
      },
      (incoming) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            incoming.on("data", (chunk: Buffer) => controller.enqueue(chunk));
            incoming.on("end", () => controller.close());
            incoming.on("error", (error) => controller.error(error));
          },
          cancel() {
            incoming.destroy();
          },
        });
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(key, item);
          } else if (value !== undefined) {
            headers.set(key, value);
          }
        }
        resolve(new Response(body, { status: incoming.statusCode ?? 0, headers }));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
  fetchFn: typeof fetch | undefined,
  lookupHost: (hostname: string) => Promise<string[]>,
  signal?: AbortSignal,
  accept: string = HTML_ACCEPT,
): Promise<Response | null> {
  let current = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const addresses = await validatePublicHttpUrl(current, lookupHost);
    if (addresses === null) return null;
    const response = fetchFn
      ? await fetchFn(fetchUrlForAddress(current, addresses[0]).toString(), {
          headers: outboundHeaders(accept, current.host),
          redirect: "manual",
          signal: requestSignal(signal),
        })
      : await nodeFetchWithAddress(current, addresses[0], signal, accept);
    if (response.url) {
      let responseUrl: URL;
      try {
        responseUrl = new URL(response.url);
      } catch {
        return null;
      }
      if ((await validatePublicHttpUrl(responseUrl, lookupHost)) === null) return null;
    }
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current);
  }
  throw new Error("Too many redirects while reading the page.");
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isFinite(parsed) || parsed > maxBytes) {
      await response.body?.cancel();
      return null;
    }
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function readResponseText(response: Response, maxBytes: number): Promise<string | null> {
  const bytes = await readResponseBytes(response, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

// ---- tool factory -----------------------------------------------------------

export function createWebSearchTools(deps: WebSearchToolDeps): ToolDefinition[] {
  const codexFetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const model = deps.model ?? DEFAULT_MODEL;
  const responsesUrl = deps.responsesUrl ?? CODEX_RESPONSES_URL;
  const storeThreshold = deps.storeThreshold ?? DEFAULT_STORE_THRESHOLD;
  const maxFetchBytes = deps.maxFetchBytes ?? MAX_FETCH_BYTES;
  const lookupHost = deps.lookupHost ?? defaultLookupHost;
  const store = createStore();

  const webSearch = defineTool({
    name: "web_search",
    label: "Search the web",
    description:
      "Look something up on the web (current docs, examples, references) and get a short answer with source links. Uses the connected Codex account, like generate_image, so keep the builder's personal details out of the query. Defaults to a cached index; pass live: true to fetch fresh pages.",
    parameters: Type.Object({
      query: Type.String({ description: "What to look up." }),
      live: Type.Optional(
        Type.Boolean({
          description:
            "Fetch fresh live pages instead of the cached index. Default false (cached).",
        }),
      ),
      domains: Type.Optional(
        Type.Array(Type.String(), { description: "Restrict the search to these domains." }),
      ),
    }),
    executionMode: "parallel",
    async execute(_callId, rawParams, signal): Promise<ToolResult> {
      const params = rawParams as { query: string; live?: boolean; domains?: string[] };
      const token = await deps.getFreshAccessToken();
      const accountId = extractCodexAccountId(token);
      if (!accountId) {
        throw new Error("Could not read the Codex account. Reconnect Codex and try again.");
      }

      const parsed = await postCodexSearch(
        buildWebSearchBody(params.query, model, params.live ?? false, params.domains),
        { token, accountId, fetchFn: codexFetchFn, sleep, responsesUrl, signal },
      );

      const answer = parsed.answer.trim() || "The search did not return a usable answer.";
      const citations = parsed.citations;
      const text =
        citations.length > 0
          ? `${answer}\n\nSources:\n${citations.map((u) => `- ${u}`).join("\n")}`
          : answer;

      return {
        content: [{ type: "text", text }],
        details: {
          provider: "codex",
          searched: parsed.queries.length > 0,
          queries: parsed.queries,
          citations,
        },
      };
    },
  });

  const searchImage = defineTool({
    name: "search_image",
    label: "Search for a picture",
    description:
      "Find a picture of something on the web and actually see it, so you understand what it looks like. " +
      "Use it when the builder names something visual you do not already know (a character, creature, object, or style) - " +
      "for example 'pusheen cat' or 'a dachshund'. It returns the real image(s) for you to look at, not just words. " +
      "Uses the connected Codex account, like web_search and generate_image, so keep the builder's personal details out of the query. " +
      "This is for understanding a look, not for making art - use generate_image to draw assets into the creation.",
    parameters: Type.Object({
      query: Type.String({
        description: "What to find a picture of, e.g. 'pusheen the cartoon cat'.",
      }),
      count: Type.Optional(
        Type.Number({
          description: `How many pictures to look at (1-${MAX_IMAGE_COUNT}). Default ${DEFAULT_IMAGE_COUNT}.`,
        }),
      ),
    }),
    executionMode: "parallel",
    async execute(_callId, rawParams, signal, _onUpdate, ctx): Promise<ToolResult> {
      const params = rawParams as { query: string; count?: number };
      const cwd = (ctx as ToolCtx | undefined)?.cwd;
      const query = params.query.trim();
      const count = Math.max(
        1,
        Math.min(MAX_IMAGE_COUNT, Math.floor(params.count ?? DEFAULT_IMAGE_COUNT)),
      );

      const token = await deps.getFreshAccessToken();
      const accountId = extractCodexAccountId(token);
      if (!accountId) {
        throw new Error("Could not read the Codex account. Reconnect Codex and try again.");
      }

      const parsed = await postCodexSearch(buildImageSearchBody(query, model), {
        token,
        accountId,
        fetchFn: codexFetchFn,
        sleep,
        responsesUrl,
        signal,
      });

      // Direct image links first, then pages we can hop through to an og:image.
      const answerUrls = extractUrls(parsed.answer);
      const candidates = [
        ...answerUrls.filter(isLikelyImageUrl),
        ...answerUrls.filter((url) => !isLikelyImageUrl(url)),
        ...parsed.citations,
      ];
      const ordered = [...new Set(candidates)].slice(0, MAX_IMAGE_CANDIDATES);

      const images: ToolResultPart[] = [];
      const sources: string[] = [];
      // Reusable ids for the pictures we persisted, in step with `sources`.
      const referenceIds: string[] = [];
      const deadline = AbortSignal.timeout(IMAGE_DOWNLOAD_BUDGET_MS);
      const downloadSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      for (const candidate of ordered) {
        if (signal?.aborted) throw new Error("Image lookup was stopped.");
        if (deadline.aborted || images.length >= count) break;
        let resolved: ResolvedImage | null = null;
        try {
          resolved = await fetchImageCandidate(
            candidate,
            {
              fetchFn: deps.fetchFn,
              lookupHost,
              maxBytes: MAX_IMAGE_BYTES,
              signal: downloadSignal,
            },
            true,
          );
        } catch {
          if (signal?.aborted) throw new Error("Image lookup was stopped.");
        }
        if (resolved) {
          images.push({ type: "image", data: resolved.data, mimeType: resolved.mimeType });
          sources.push(resolved.source);
          // Persist the picture so the model can reuse it as a reference later.
          // A failed save just means no id - the picture is still shown to look at.
          if (deps.persistImage && cwd) {
            const saved = await deps
              .persistImage(cwd, {
                data: resolved.data,
                mimeType: resolved.mimeType,
                source: "searched",
                meta: { query, sourceUrl: resolved.source },
              })
              .catch(() => undefined);
            if (saved) referenceIds.push(saved.id);
          }
        }
      }

      if (images.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `I couldn't find a picture of "${query}" to look at. Try describing it a bit differently.`,
            },
          ],
          details: { query, sources: [] },
        };
      }

      const intro =
        images.length > 1
          ? `Here are ${images.length} pictures of "${query}" - take a look.`
          : `Here is a picture of "${query}" - take a look.`;
      // Surface the reusable ids in text (not stripped from the logbook like the
      // pixels are), so the model can pass one to generate_image reference_paths
      // (bots) or delegate_build/create_creation referencePictureIds (Bit).
      const reuseNote = referenceIds.length
        ? `\n\nSaved so you can reuse ${referenceIds.length > 1 ? "them" : "it"} later - reference id${
            referenceIds.length > 1 ? "s" : ""
          }: ${referenceIds.join(", ")}.`
        : "";
      const text = `${intro}\n\nFrom:\n${sources.map((u) => `- ${u}`).join("\n")}${reuseNote}`;

      return {
        content: [{ type: "text", text }, ...images],
        details: { query, sources, shown: images.length, referenceIds },
      };
    },
  });

  const fetchContent = defineTool({
    name: "fetch_content",
    label: "Read a web page",
    description:
      "Fetch a web page and return its readable text as markdown. Use it to read a doc, article, or reference you already have the URL for. Reads the page locally; only works on http(s) web addresses.",
    parameters: Type.Object({
      url: Type.String({ description: "The http(s) URL of the page to read." }),
    }),
    executionMode: "parallel",
    async execute(_callId, rawParams, signal): Promise<ToolResult> {
      const params = rawParams as { url: string };
      const url = params.url.trim();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return {
          content: [{ type: "text", text: `"${url}" is not a valid web address.` }],
          details: undefined,
        };
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return {
          content: [
            { type: "text", text: "I can only read pages from http or https web addresses." },
          ],
          details: undefined,
        };
      }

      const response = await fetchWithSafeRedirects(parsedUrl, deps.fetchFn, lookupHost, signal);
      if (response === null) {
        return {
          content: [{ type: "text", text: "I can only read public web pages." }],
          details: undefined,
        };
      }
      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Could not read ${url} (status ${response.status}).` }],
          details: { url, status: response.status },
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await readResponseText(response, maxFetchBytes);
      if (raw === null) {
        return {
          content: [{ type: "text", text: `Could not read ${url} because the page is too large.` }],
          details: { url },
        };
      }

      let title = parsedUrl.hostname;
      let bodyText: string;
      if (contentType.includes("html")) {
        const extracted = htmlToMarkdown(raw);
        if (extracted.title) title = extracted.title;
        bodyText = extracted.markdown || raw.slice(0, storeThreshold);
      } else {
        bodyText = raw;
      }

      const document = `# ${title}\n${url}\n\n${bodyText}`.trim();
      if (document.length > storeThreshold) {
        const id = store.save(document);
        const preview = `${document.slice(0, 2_000)}\n\n[...truncated]`;
        return {
          content: [
            {
              type: "text",
              text: `${preview}\n\nThe full page was long, so it is saved as id "${id}". Call get_search_content with that id to read all of it.`,
            },
          ],
          details: { url, title, storedId: id },
        };
      }

      return { content: [{ type: "text", text: document }], details: { url, title } };
    },
  });

  const getSearchContent = defineTool({
    name: "get_search_content",
    label: "Read saved web content",
    description:
      "Read the full text that an earlier fetch_content saved when the page was too long to return inline. Pass the id you were given.",
    parameters: Type.Object({
      id: Type.String({ description: "The id returned by a previous fetch_content call." }),
    }),
    executionMode: "parallel",
    async execute(_callId, rawParams): Promise<ToolResult> {
      const params = rawParams as { id: string };
      const text = store.get(params.id);
      if (text === null) {
        return {
          content: [
            {
              type: "text",
              text: `No saved content found for id "${params.id}". It may have expired - fetch the page again.`,
            },
          ],
          details: undefined,
        };
      }
      return { content: [{ type: "text", text }], details: { id: params.id } };
    },
  });

  return [webSearch, searchImage, fetchContent, getSearchContent];
}
