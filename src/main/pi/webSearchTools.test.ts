import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createWebSearchTools } from "./webSearchTools";

/** A token whose JWT payload carries a ChatGPT account id, like a real Codex token. */
function fakeCodexToken(accountId = "acct_123"): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc({ chatgpt_account_id: accountId })}.sig`;
}

/** Builds a Response whose body streams the given SSE chunks, as the Codex backend does. */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

function delta(text: string): string {
  return `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`;
}
function searchCallDone(query: string): string {
  return `data: ${JSON.stringify({
    type: "response.output_item.done",
    item: { type: "web_search_call", action: { type: "search", query, queries: [query] } },
  })}\n\n`;
}
function messageDone(text: string, citations: string[] = []): string {
  const annotations = citations.map((url) => ({ type: "url_citation", url, title: url }));
  return `data: ${JSON.stringify({
    type: "response.output_item.done",
    item: {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text, annotations }],
    },
  })}\n\n`;
}
const COMPLETED = `data: ${JSON.stringify({ type: "response.completed", response: { id: "r" } })}\n\n`;

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function chunkedResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[pulls]));
      pulls += 1;
    },
  });
  return new Response(body, { headers });
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

const CTX = { cwd: "/tmp/creation" };
const run = (tool: ToolDefinition, params: unknown) =>
  // biome-ignore lint/suspicious/noExplicitAny: test invokes the runtime execute signature directly
  (tool as any).execute("call-1", params, undefined, undefined, CTX);

const RESPONSES_URL = "https://codex.test/responses";

describe("web_search tool (Codex-native)", () => {
  it("calls the Codex responses backend with the web_search tool and the connected account", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken("acct_xyz"),
      model: "gpt-5.5",
      responsesUrl: RESPONSES_URL,
      fetchFn: async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return sseResponse([
          searchCallDone("phaser latest version"),
          delta("Phaser v4.1.0"),
          messageDone("Phaser v4.1.0 is current. Source: https://phaser.io"),
          COMPLETED,
        ]);
      },
    });

    const result = await run(findTool(tools, "web_search"), { query: "latest phaser version" });

    expect(capturedUrl).toBe(RESPONSES_URL);
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "web_search" })]),
    );
    expect(body.model).toBe("gpt-5.5");
    expect(JSON.stringify(body.input)).toContain("latest phaser version");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${fakeCodexToken("acct_xyz")}`);
    expect(headers["chatgpt-account-id"]).toBe("acct_xyz");
    expect(headers.originator).toBe("codex_cli_rs");

    const text = result.content[0].text as string;
    expect(text).toContain("Phaser v4.1.0");
    expect(result.details?.searched).toBe(true);
  });

  it("defaults to cached search (no live page fetching) and goes live only when asked", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      responsesUrl: RESPONSES_URL,
      fetchFn: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return sseResponse([messageDone("ok"), COMPLETED]);
      },
    });

    await run(findTool(tools, "web_search"), { query: "a" });
    await run(findTool(tools, "web_search"), { query: "b", live: true });

    const cachedTool = (bodies[0].tools as Array<Record<string, unknown>>)[0];
    const liveTool = (bodies[1].tools as Array<Record<string, unknown>>)[0];
    expect(cachedTool.external_web_access).toBe(false);
    expect(liveTool.external_web_access).toBe(true);
  });

  it("surfaces structured url citations when the backend returns them", async () => {
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      responsesUrl: RESPONSES_URL,
      fetchFn: async () =>
        sseResponse([
          searchCallDone("q"),
          messageDone("Here is the answer.", ["https://docs.example/guide"]),
          COMPLETED,
        ]),
    });

    const result = await run(findTool(tools, "web_search"), { query: "anything" });

    expect(result.content[0].text as string).toContain("https://docs.example/guide");
    expect(result.details?.citations).toContain("https://docs.example/guide");
  });

  it("reports backend failures instead of pretending it searched", async () => {
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      responsesUrl: RESPONSES_URL,
      fetchFn: async () => new Response("nope", { status: 400 }),
    });

    await expect(run(findTool(tools, "web_search"), { query: "x" })).rejects.toThrow();
  });
});

describe("no code_search tool", () => {
  it("is not registered (Exa is gone)", () => {
    const tools = createWebSearchTools({ getFreshAccessToken: async () => fakeCodexToken() });
    expect(tools.find((t) => t.name === "code_search")).toBeUndefined();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["web_search", "fetch_content", "get_search_content"]),
    );
  });
});

describe("fetch_content tool", () => {
  it("fetches a page locally and converts the readable article to markdown (no Codex, no Exa)", async () => {
    const html = `<!doctype html><html><head><title>How Loops Work</title></head>
      <body><nav>menu menu menu</nav><article>
        <h1>How Loops Work</h1>
        <p>A game loop runs every frame to update and draw the world. ${"It keeps the game moving. ".repeat(20)}</p>
        <p>First you update positions, then you check collisions, then you render. ${"That is the cycle. ".repeat(20)}</p>
      </article></body></html>`;
    let capturedUrl: string | undefined;
    let tokenCalls = 0;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => {
        tokenCalls += 1;
        return fakeCodexToken();
      },
      lookupHost: async () => ["93.184.216.34"],
      fetchFn: async (url) => {
        capturedUrl = String(url);
        return htmlResponse(html);
      },
    });

    const result = await run(findTool(tools, "fetch_content"), {
      url: "https://example.com/loops",
    });

    expect(capturedUrl).toBe("https://93.184.216.34/loops");
    expect(tokenCalls).toBe(0); // fetch_content never touches Codex
    const text = result.content[0].text as string;
    expect(text).toContain("How Loops Work");
    expect(text).toContain("game loop runs every frame");
    expect(text).not.toContain("menu menu menu");
  });

  it("refuses non-web URLs like file:// for safety", async () => {
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async () => htmlResponse("<html></html>"),
    });

    const result = await run(findTool(tools, "fetch_content"), { url: "file:///etc/passwd" });

    expect(result.content[0].text as string).toMatch(/web address|http/i);
  });

  it("refuses loopback URLs before fetching", async () => {
    let calls = 0;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async () => {
        calls += 1;
        return htmlResponse("<html></html>");
      },
    });

    const result = await run(findTool(tools, "fetch_content"), { url: "http://127.0.0.1:3000" });

    expect(calls).toBe(0);
    expect(result.content[0].text as string).toMatch(/public web/i);
  });

  it("refuses redirects to private addresses before fetching the redirected URL", async () => {
    const fetched: string[] = [];
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["93.184.216.34"],
      fetchFn: async (url) => {
        fetched.push(String(url));
        return new Response(null, {
          status: 302,
          headers: { location: "http://192.168.1.10/admin" },
        });
      },
    });

    const result = await run(findTool(tools, "fetch_content"), {
      url: "https://example.com/start",
    });

    expect(fetched).toEqual(["https://93.184.216.34/start"]);
    expect(result.content[0].text as string).toMatch(/public web/i);
  });

  it("rejects oversized content-length before reading the body", async () => {
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["93.184.216.34"],
      storeThreshold: 10,
      maxFetchBytes: 10,
      fetchFn: async () =>
        new Response("too much", {
          headers: { "content-length": "1000000", "content-type": "text/html" },
        }),
    });

    const result = await run(findTool(tools, "fetch_content"), { url: "https://example.com/huge" });

    expect(result.content[0].text as string).toMatch(/too large/i);
  });

  it("stops streaming once the response exceeds the read limit", async () => {
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["93.184.216.34"],
      storeThreshold: 10,
      maxFetchBytes: 10,
      fetchFn: async () =>
        chunkedResponse(["12345", "67890", "extra"], { "content-type": "text/html" }),
    });

    const result = await run(findTool(tools, "fetch_content"), {
      url: "https://example.com/stream",
    });

    expect(result.content[0].text as string).toMatch(/too large/i);
  });

  it("parks a long page in the store and hands back an id for get_search_content", async () => {
    const big = `<p>${"word ".repeat(20_000)}</p>`;
    const html = `<!doctype html><html><head><title>Big</title></head><body><article><h1>Big</h1>${big}</article></body></html>`;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["93.184.216.34"],
      fetchFn: async () => htmlResponse(html),
    });

    const fetched = await run(findTool(tools, "fetch_content"), { url: "https://example.com/big" });
    const id = fetched.details?.storedId as string;
    expect(id).toBeTruthy();

    const got = await run(findTool(tools, "get_search_content"), { id });
    expect((got.content[0].text as string).length).toBeGreaterThan(50_000);
  });

  it("refuses hostnames that resolve to private addresses", async () => {
    let calls = 0;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["10.0.0.12"],
      fetchFn: async () => {
        calls += 1;
        return htmlResponse("<html></html>");
      },
    });

    const result = await run(findTool(tools, "fetch_content"), {
      url: "https://docs.example.test/page",
    });

    expect(calls).toBe(0);
    expect(result.content[0].text as string).toMatch(/public web/i);
  });

  it("refuses hostnames that resolve to IPv6 link-local addresses", async () => {
    let calls = 0;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["fe90::1"],
      fetchFn: async () => {
        calls += 1;
        return htmlResponse("<html></html>");
      },
    });

    const result = await run(findTool(tools, "fetch_content"), {
      url: "https://docs.example.test/page",
    });

    expect(calls).toBe(0);
    expect(result.content[0].text as string).toMatch(/public web/i);
  });

  it("refuses hostnames that resolve to hexadecimal IPv4-mapped loopback addresses", async () => {
    let calls = 0;
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["::ffff:7f00:1"],
      fetchFn: async () => {
        calls += 1;
        return htmlResponse("<html></html>");
      },
    });

    const result = await run(findTool(tools, "fetch_content"), {
      url: "https://docs.example.test/page",
    });

    expect(calls).toBe(0);
    expect(result.content[0].text as string).toMatch(/public web/i);
  });

  it("binds hostname fetches to the validated DNS answer", async () => {
    const fetched: string[] = [];
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      lookupHost: async () => ["93.184.216.34"],
      fetchFn: async (url) => {
        fetched.push(String(url));
        return htmlResponse(
          "<html><body><article><h1>Safe</h1><p>Public page content.</p></article></body></html>",
        );
      },
    });

    await run(findTool(tools, "fetch_content"), {
      url: "https://docs.example.test/page",
    });

    expect(fetched).toEqual(["https://93.184.216.34/page"]);
  });
});

describe("get_search_content tool", () => {
  it("explains when an id is unknown instead of throwing", async () => {
    const tools = createWebSearchTools({ getFreshAccessToken: async () => fakeCodexToken() });

    const result = await run(findTool(tools, "get_search_content"), { id: "does-not-exist" });

    expect(result.content[0].text as string).toMatch(/no saved|not found|expired/i);
  });
});
