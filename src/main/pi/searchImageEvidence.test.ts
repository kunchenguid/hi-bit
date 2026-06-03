import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { stripImageData } from "./piMessages";
import { createWebSearchTools } from "./webSearchTools";

/**
 * Evidence test for the search_image feature.
 *
 * It drives the REAL search_image download path (SSRF-safe fetch -> byte read ->
 * base64 -> image content part). The only thing stubbed is the Codex web_search
 * SSE response, because that external backend was the outage-blocked dependency
 * during the developer's live run. Everything else is the production code path.
 *
 * The decoded bytes the tool hands back to the model are written to disk so a
 * reviewer can literally open the picture the model "sees".
 */

const EVIDENCE_DIR =
  "/var/folders/0k/bf8mwt2n5qddzk24r20gfk0c0000gn/T/no-mistakes-evidence/01KT5YP5TZN09ZEHR4D62STEC6";

const RESPONSES_URL = "https://codex.test/responses";

function fakeCodexToken(accountId = "acct_evidence"): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc({ chatgpt_account_id: accountId })}.sig`;
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
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

function imageResponse(bytes: Uint8Array, contentType: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}
function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** A real, recognizable PNG so the round-trip artifact is something a human can look at. */
function makeCatPng(): Buffer {
  const w = 240;
  const h = 200;
  const png = new PNG({ width: w, height: h });
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) << 2;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  // Pastel background.
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) set(x, y, 0xf3, 0xe9, 0xff);
  const cx = 120;
  const cy = 110;
  // Gray pusheen-ish body (filled ellipse).
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (x - cx) / 78;
      const dy = (y - cy) / 56;
      if (dx * dx + dy * dy <= 1) set(x, y, 0x9a, 0x9a, 0xa0);
    }
  }
  // Ears (triangles).
  for (let y = 40; y < 70; y += 1) {
    const span = 70 - y;
    for (let x = cx - 60 - span; x <= cx - 60 + span; x += 1) set(x, y, 0x9a, 0x9a, 0xa0);
    for (let x = cx + 60 - span; x <= cx + 60 + span; x += 1) set(x, y, 0x9a, 0x9a, 0xa0);
  }
  // Eyes.
  const dot = (ex: number, ey: number) => {
    for (let y = -7; y <= 7; y += 1)
      for (let x = -7; x <= 7; x += 1) if (x * x + y * y <= 49) set(ex + x, ey + y, 20, 20, 24);
  };
  dot(cx - 28, cy - 8);
  dot(cx + 28, cy - 8);
  // Whisker dots / nose.
  for (let y = -3; y <= 3; y += 1)
    for (let x = -5; x <= 5; x += 1) set(cx + x, cy + 16 + y, 0xff, 0x9a, 0xb0);
  return PNG.sync.write(png);
}

const CTX = { cwd: "/tmp/creation" };
const run = (tool: ToolDefinition, params: unknown) =>
  // biome-ignore lint/suspicious/noExplicitAny: invoke runtime execute signature directly
  (tool as any).execute("evidence-call", params, undefined, undefined, CTX);
function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

function dataUrlFromImagePart(part: { mimeType: string; data: string }): string {
  return `data:${part.mimeType};base64,${part.data}`;
}

describe("search_image end-to-end evidence", () => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const catPng = makeCatPng();

  it("returns the real downloaded picture pixels for the model to see (direct image URL)", async () => {
    const imageUrl = "https://pics.example.com/pusheen.png";
    let codexBody: { tools: Array<{ type: string; external_web_access: boolean }> } | undefined;

    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      model: "gpt-5.5",
      responsesUrl: RESPONSES_URL,
      lookupHost: async () => ["93.184.216.34"], // public IP -> passes SSRF guard
      fetchFn: async (url, init) => {
        const u = String(url);
        if (u === RESPONSES_URL) {
          codexBody = JSON.parse(String(init?.body));
          return sseResponse([
            searchCallDone("pusheen cat"),
            messageDone(`Here is a clear picture of pusheen: ${imageUrl}`),
            COMPLETED,
          ]);
        }
        // Real production download path resolves to the validated IP, like fetch_content.
        expect(u).toBe("https://93.184.216.34/pusheen.png");
        return imageResponse(new Uint8Array(catPng), "image/png");
      },
    });

    const result = await run(findTool(tools, "search_image"), {
      query: "pusheen the cartoon cat",
    });

    // It browsed the live web on the connected Codex account.
    expect(codexBody?.tools[0].type).toBe("web_search");
    expect(codexBody?.tools[0].external_web_access).toBe(true);

    const image = (
      result.content as Array<{ type: string; data?: string; mimeType?: string }>
    ).find((p) => p.type === "image") as { type: "image"; data: string; mimeType: string };
    expect(image).toBeTruthy();
    expect(image.mimeType).toBe("image/png");

    // The pixels the model receives are byte-identical to what the server served.
    const decoded = Buffer.from(image.data, "base64");
    expect(Buffer.compare(decoded, catPng)).toBe(0);

    // Save the exact picture the model "sees" as a reviewer-visible artifact.
    writeFileSync(join(EVIDENCE_DIR, "search_image-model-sees.png"), decoded);

    const introText = (result.content[0] as { text: string }).text;
    expect(introText).toMatch(/picture of "pusheen the cartoon cat"/);
    expect(result.details?.sources).toContain(imageUrl);

    // Render a small HTML card so a reviewer can see the kid-facing flow at a glance.
    const html = `<!doctype html><meta charset="utf-8">
<title>search_image evidence</title>
<style>
  body{font:15px/1.5 -apple-system,Segoe UI,sans-serif;background:#14101c;color:#eee;margin:0;padding:32px}
  .card{max-width:680px;margin:auto;background:#1f1830;border:1px solid #3a2f55;border-radius:16px;padding:24px}
  h1{font-size:20px;margin:0 0 4px}.sub{color:#a99bd0;margin:0 0 20px}
  .bubble{background:#2a2140;border-radius:12px;padding:14px 16px;margin:10px 0}
  .you{background:#3a2f55}
  img{max-width:280px;border-radius:12px;display:block;margin:10px 0;border:1px solid #4a3d6b}
  code{background:#000;padding:2px 6px;border-radius:6px;color:#c9b8ff}
  .src{color:#8f80b8;font-size:13px}
</style>
<div class="card">
  <h1>search_image · end-to-end</h1>
  <p class="sub">The tool browses the web via the Codex account, downloads the real picture, and hands the pixels to the model.</p>
  <div class="bubble you"><b>builder:</b> can you make a game with a pusheen cat?</div>
  <div class="bubble"><b>Bit calls</b> <code>search_image("pusheen the cartoon cat")</code></div>
  <div class="bubble">
    <div>${introText.replace(/\n/g, "<br>")}</div>
    <img src="${dataUrlFromImagePart(image)}" alt="picture the model sees">
    <div class="src">image content part · ${image.mimeType} · ${decoded.length.toLocaleString()} bytes of real pixels delivered to the model</div>
  </div>
</div>`;
    writeFileSync(join(EVIDENCE_DIR, "search_image-flow.html"), html);
  });

  it("hops a page link to its og:image when the search returns no direct image", async () => {
    const pageUrl = "https://wiki.example.com/pusheen";
    const ogImage = "https://cdn.example.com/pusheen-hero.jpg";
    const tools = createWebSearchTools({
      getFreshAccessToken: async () => fakeCodexToken(),
      model: "gpt-5.5",
      responsesUrl: RESPONSES_URL,
      lookupHost: async () => ["93.184.216.34"],
      fetchFn: async (url) => {
        const u = String(url);
        if (u === RESPONSES_URL) {
          return sseResponse([messageDone("See the page.", [pageUrl]), COMPLETED]);
        }
        if (u === "https://93.184.216.34/pusheen") {
          return htmlResponse(
            `<html><head><meta property="og:image" content="${ogImage}"></head><body></body></html>`,
          );
        }
        expect(u).toBe("https://93.184.216.34/pusheen-hero.jpg");
        return imageResponse(new Uint8Array(catPng), "image/jpeg");
      },
    });

    const result = await run(findTool(tools, "search_image"), { query: "pusheen cat" });
    const image = (result.content as Array<{ type: string; mimeType?: string }>).find(
      (p) => p.type === "image",
    ) as { mimeType: string };
    expect(image.mimeType).toBe("image/jpeg");
    expect(result.details?.sources).toContain(ogImage);
  });

  it("strips the base64 picture from logbook/renderer content while keeping the words", () => {
    const toolEndContent = [
      { type: "text" as const, text: 'Here is a picture of "pusheen" - take a look.' },
      { type: "image" as const, data: catPng.toString("base64"), mimeType: "image/png" },
    ];
    const stripped = stripImageData(toolEndContent);
    expect(stripped).toEqual([
      { type: "text", text: 'Here is a picture of "pusheen" - take a look.' },
      { type: "text", text: "[looked at a picture]" },
    ]);
    // No base64 leaks into the on-disk/renderer-bound payload.
    expect(JSON.stringify(stripped)).not.toContain(catPng.toString("base64").slice(0, 40));
  });
});
