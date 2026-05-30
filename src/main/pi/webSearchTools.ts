import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { Type } from "typebox";
import { extractCodexAccountId } from "../auth/codexOAuth";

/**
 * Web-access tools for worker bots.
 *
 * Workers build kids' web apps and sometimes need to look something up - current
 * library/API docs, an example, a reference page. Two tools cover that with no
 * third-party dependency:
 *
 * - `web_search` reuses Hi-Bit's own Codex login. It calls the Codex Responses
 *   backend with the native `web_search` hosted tool (the same backend + token
 *   the `generate_image` tool uses), so search runs on the parent's existing
 *   ChatGPT connection - nothing goes to an outside search service. It defaults
 *   to Codex's cached index (no live page fetching), which keeps the
 *   prompt-injection surface small for a young audience; pass `live: true` to
 *   fetch fresh pages.
 * - `fetch_content` pulls a page the worker already has the URL for and turns
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
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
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

function nodeFetchWithAddress(url: URL, address: string, signal?: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        headers: { accept: "text/html,application/xhtml+xml", host: url.host },
        lookup: (_hostname, _options, callback) => {
          callback(null, address, isIP(address) as 4 | 6);
        },
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
): Promise<Response | null> {
  let current = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const addresses = await validatePublicHttpUrl(current, lookupHost);
    if (addresses === null) return null;
    const response = fetchFn
      ? await fetchFn(fetchUrlForAddress(current, addresses[0]).toString(), {
          headers: { accept: "text/html,application/xhtml+xml", host: current.host },
          redirect: "manual",
          signal: requestSignal(signal),
        })
      : await nodeFetchWithAddress(current, addresses[0], signal);
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

async function readResponseText(response: Response, maxBytes: number): Promise<string | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isFinite(parsed) || parsed > maxBytes) return null;
  }
  if (!response.body) return await response.text();
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
  return new TextDecoder().decode(combined);
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

      const body = JSON.stringify(
        buildWebSearchBody(params.query, model, params.live ?? false, params.domains),
      );
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId,
        originator: ORIGINATOR,
        "OpenAI-Beta": "responses=experimental",
        accept: "text/event-stream",
        "content-type": "application/json",
      };

      let parsed: WebSearchParse | undefined;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        if (signal?.aborted) throw new Error("Search was stopped.");
        const response = await codexFetchFn(responsesUrl, {
          method: "POST",
          headers,
          body,
          signal: requestSignal(signal),
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          if (attempt < MAX_RETRIES && RETRYABLE_STATUS.has(response.status)) {
            await sleep(1000 * 2 ** attempt);
            continue;
          }
          throw new Error(`Codex web search failed (${response.status}): ${errorText}`.trim());
        }
        parsed = await parseWebSearchSse(response, signal);
        break;
      }

      const answer = parsed?.answer.trim() || "The search did not return a usable answer.";
      const citations = parsed?.citations ?? [];
      const text =
        citations.length > 0
          ? `${answer}\n\nSources:\n${citations.map((u) => `- ${u}`).join("\n")}`
          : answer;

      return {
        content: [{ type: "text", text }],
        details: {
          provider: "codex",
          searched: (parsed?.queries.length ?? 0) > 0,
          queries: parsed?.queries ?? [],
          citations,
        },
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

  return [webSearch, fetchContent, getSearchContent];
}
