import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGenerateImageTool } from "./imageGenTool";

/** A token whose JWT payload carries a ChatGPT account id, like a real Codex token. */
function fakeCodexToken(accountId = "acct_123"): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc({ chatgpt_account_id: accountId })}.sig`;
}

/** Builds a Response whose body streams the given SSE chunks, as the Codex backend would. */
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

function imageDoneEvent(base64: string, revisedPrompt?: string): string {
  return `data: ${JSON.stringify({
    type: "response.output_item.done",
    item: {
      type: "image_generation_call",
      id: "ig_1",
      status: "completed",
      result: base64,
      revised_prompt: revisedPrompt,
    },
  })}\n\n`;
}

async function makeCwd(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-imagegen-"));
}

describe("generate_image tool", () => {
  it("calls the Codex responses backend with the image_generation tool and saves the result", async () => {
    const cwd = await makeCwd();
    const imageBytes = Buffer.from("fake-png-bytes");
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;

    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken("acct_xyz"),
      model: "gpt-5.5",
      fetchFn: async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return sseResponse([
          'data: {"type":"response.created","response":{"id":"resp_1"}}\n\n',
          imageDoneEvent(imageBytes.toString("base64"), "a friendly dragon"),
          'data: {"type":"response.completed","response":{"id":"resp_1"}}\n\n',
          "data: [DONE]\n\n",
        ]);
      },
    });

    const result = await tool.execute(
      "call-1",
      { prompt: "a friendly dragon", fileName: "images/dragon.png" },
      undefined,
      undefined,
      { cwd } as unknown as Parameters<typeof tool.execute>[4],
    );

    // Hit the right endpoint with Codex auth.
    expect(capturedUrl).toBe("https://chatgpt.com/backend-api/codex/responses");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${fakeCodexToken("acct_xyz")}`);
    expect(headers.get("chatgpt-account-id")).toBe("acct_xyz");

    // Asked the routing model to use the native image_generation tool.
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.model).toBe("gpt-5.5");
    expect(body.tools).toEqual([{ type: "image_generation", output_format: "png" }]);
    expect(body.input[0].content[0].text).toBe("a friendly dragon");

    // Wrote the decoded image into the workbench at the chosen path.
    const saved = await readFile(join(cwd, "images/dragon.png"));
    expect(saved.equals(imageBytes)).toBe(true);

    // Returns a small text result, never the base64 image (keeps the logbook small).
    expect(result.content.every((part) => part.type === "text")).toBe(true);
    const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join(" ");
    expect(text).toContain("images/dragon.png");
    expect(text.toLowerCase()).toContain("dragon");
  });

  it("retries on a transient backend error then succeeds", async () => {
    const cwd = await makeCwd();
    let calls = 0;
    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      sleep: async () => {},
      fetchFn: async () => {
        calls += 1;
        if (calls === 1) return sseResponse(["upstream error"], 503);
        return sseResponse([imageDoneEvent(Buffer.from("ok").toString("base64"))]);
      },
    });

    const result = await tool.execute(
      "call-2",
      { prompt: "a cat", fileName: "cat.png" },
      undefined,
      undefined,
      { cwd } as unknown as Parameters<typeof tool.execute>[4],
    );

    expect(calls).toBe(2);
    const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join(" ");
    expect(text).toContain("cat.png");
    expect(await readFile(join(cwd, "cat.png"), "utf8")).toBe("ok");
  });

  it("throws a helpful error when the backend refuses to make an image", async () => {
    const cwd = await makeCwd();
    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async () =>
        sseResponse([
          'data: {"type":"response.output_text.delta","delta":"I can\'t make that."}\n\n',
          'data: {"type":"response.completed","response":{"id":"r"}}\n\n',
        ]),
    });

    await expect(
      tool.execute("call-3", { prompt: "x", fileName: "x.png" }, undefined, undefined, {
        cwd,
      } as unknown as Parameters<typeof tool.execute>[4]),
    ).rejects.toThrow(/did not return an image/i);
  });

  it("attaches a known job reference picture as an input_image, by id", async () => {
    const cwd = await makeCwd();
    // The builder's picture lives at factory level, outside the workbench.
    const refDir = await makeCwd();
    const refBytes = Buffer.from("reference-jpeg-bytes");
    await writeFile(join(refDir, "builder.jpg"), refBytes);
    let capturedBody: { input: Array<{ content: Array<Record<string, unknown>> }> } | undefined;

    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      // Resolves the reference id to the factory-level file (never copied into cwd).
      resolveReference: (toolCwd, ref) => {
        expect(toolCwd).toBe(cwd);
        return ref === "pic_42"
          ? { path: join(refDir, "builder.jpg"), mimeType: "image/jpeg" }
          : undefined;
      },
      fetchFn: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return sseResponse([imageDoneEvent(Buffer.from("png").toString("base64"))]);
      },
    });

    await tool.execute(
      "call-ref",
      { prompt: "a hero like the picture", fileName: "hero.png", reference_paths: ["pic_42"] },
      undefined,
      undefined,
      { cwd } as unknown as Parameters<typeof tool.execute>[4],
    );

    const content = capturedBody?.input[0].content ?? [];
    expect(content[0]).toEqual({ type: "input_text", text: "a hero like the picture" });
    const image = content.find((part) => part.type === "input_image");
    expect(image).toEqual({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${refBytes.toString("base64")}`,
    });
  });

  it("attaches a workbench-relative reference file as an input_image", async () => {
    const cwd = await makeCwd();
    const refBytes = Buffer.from("earlier-generated-art");
    await mkdir(dirname(join(cwd, "images/prior.png")), { recursive: true });
    await writeFile(join(cwd, "images/prior.png"), refBytes);
    let capturedBody: { input: Array<{ content: Array<Record<string, unknown>> }> } | undefined;

    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return sseResponse([imageDoneEvent(Buffer.from("png").toString("base64"))]);
      },
    });

    await tool.execute(
      "call-ref2",
      { prompt: "match this", fileName: "next.png", reference_paths: ["images/prior.png"] },
      undefined,
      undefined,
      { cwd } as unknown as Parameters<typeof tool.execute>[4],
    );

    const image = (capturedBody?.input[0].content ?? []).find(
      (part) => part.type === "input_image",
    );
    expect(image).toEqual({
      type: "input_image",
      image_url: `data:image/png;base64,${refBytes.toString("base64")}`,
    });
  });

  it("errors clearly when a reference path can't be found", async () => {
    const cwd = await makeCwd();
    let fetched = false;
    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async () => {
        fetched = true;
        return sseResponse([imageDoneEvent(Buffer.from("x").toString("base64"))]);
      },
    });

    await expect(
      tool.execute(
        "call-ref3",
        { prompt: "x", fileName: "x.png", reference_paths: ["images/missing.png"] },
        undefined,
        undefined,
        { cwd } as unknown as Parameters<typeof tool.execute>[4],
      ),
    ).rejects.toThrow(/reference/i);
    expect(fetched).toBe(false);
  });

  it("rejects a reference path that escapes the workbench", async () => {
    const cwd = await makeCwd();
    let fetched = false;
    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async () => {
        fetched = true;
        return sseResponse([imageDoneEvent(Buffer.from("x").toString("base64"))]);
      },
    });

    await expect(
      tool.execute(
        "call-ref4",
        { prompt: "x", fileName: "x.png", reference_paths: ["../secret.png"] },
        undefined,
        undefined,
        { cwd } as unknown as Parameters<typeof tool.execute>[4],
      ),
    ).rejects.toThrow(/inside the creation|outside/i);
    expect(fetched).toBe(false);
  });

  it("refuses to write outside the workbench", async () => {
    const cwd = await makeCwd();
    let fetched = false;
    const tool = createGenerateImageTool({
      getFreshAccessToken: async () => fakeCodexToken(),
      fetchFn: async () => {
        fetched = true;
        return sseResponse([imageDoneEvent(Buffer.from("x").toString("base64"))]);
      },
    });

    await expect(
      tool.execute("call-4", { prompt: "x", fileName: "../escape.png" }, undefined, undefined, {
        cwd,
      } as unknown as Parameters<typeof tool.execute>[4]),
    ).rejects.toThrow(/inside the creation|outside/i);
    expect(fetched).toBe(false);
  });
});
