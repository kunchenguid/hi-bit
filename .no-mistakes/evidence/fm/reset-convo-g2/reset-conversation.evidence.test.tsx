// @vitest-environment jsdom

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationService } from "../../../../src/main/conversation/conversationService";
import { bootstrapLayout, profileConversationPaths } from "../../../../src/main/storage/layout";
import { ResetConversationControl } from "../../../../src/renderer/src/components/ResetConversationControl";

const evidenceDir = join(process.cwd(), ".no-mistakes/evidence/fm/reset-convo-g2");
const artifactPath = join(evidenceDir, "reset-conversation-evidence.html");

describe("reset conversation evidence", () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it("renders the grown-up confirmation and records preserved reset state", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const rootDir = await mkdtemp(join(tmpdir(), "hibit-reset-evidence-"));
    const layout = await bootstrapLayout(rootDir);
    const service = new ConversationService(layout, () => new Date("2026-01-02T03:04:10.000Z"));
    const paths = profileConversationPaths(layout, "ada");

    const builder = await service.saveAttachment("ada", {
      mimeType: "image/png",
      data: Buffer.from("builder-picture").toString("base64"),
    });
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "use this dragon picture later",
      createdAt: "2026-01-02T03:04:10.000Z",
      image: builder,
    });
    await service.appendMessage("ada", {
      id: "a1",
      role: "assistant",
      text: "I will remember it for the build.",
      createdAt: "2026-01-02T03:04:11.000Z",
    });
    const searched = await service.saveImage("ada", {
      mimeType: "image/jpeg",
      data: Buffer.from("searched-picture").toString("base64"),
      source: "searched",
      meta: { query: "friendly dragon" },
    });
    await mkdir(paths.bitSessionsDir, { recursive: true });
    const oldSessionFile = join(paths.bitSessionsDir, "old-session.jsonl");
    await writeFile(oldSessionFile, "old session state", "utf8");
    await service.setBitSessionFile("ada", oldSessionFile);

    const beforeMessages = await service.readTranscript("ada");
    const beforeSession = await service.getBitSessionFile("ada");
    const beforeImages = await service.listImages("ada");

    await service.resetConversation("ada");

    const afterMessages = await service.readTranscript("ada");
    const afterSession = await service.getBitSessionFile("ada");
    const builderAfter = await service.resolveImage("ada", builder.id as string);
    const searchedAfter = await service.resolveImage("ada", searched.id);
    const attachmentFiles = (await readdir(paths.attachmentsDir)).filter((file) =>
      /\.(png|jpe?g|webp|gif)$/i.test(file),
    );
    const transcriptGone = await readFile(paths.transcriptPath, "utf8").then(
      () => false,
      () => true,
    );
    const sessionsGone = await readdir(paths.bitSessionsDir).then(
      () => false,
      () => true,
    );

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <ResetConversationControl
          builderName="Ada"
          busy={false}
          blockedReason={null}
          onReset={async () => {}}
        />,
      );
    });
    const closedMarkup = host.innerHTML;
    await act(async () => {
      host?.querySelector<HTMLButtonElement>("button")?.click();
    });
    const confirmationMarkup = host.innerHTML;

    expect(afterMessages).toEqual([]);
    expect(afterSession).toBeUndefined();
    expect(transcriptGone).toBe(true);
    expect(sessionsGone).toBe(true);
    expect(builderAfter).toMatchObject({ source: "builder", messageText: "" });
    expect(searchedAfter).toMatchObject({ source: "searched", messageText: "friendly dragon" });
    expect(attachmentFiles.length).toBe(2);

    await writeFile(
      artifactPath,
      renderEvidenceHtml({
        closedMarkup,
        confirmationMarkup,
        beforeMessages: beforeMessages.map((m) => `${m.role}: ${m.text}`),
        beforeSession,
        beforeImages: beforeImages.map((image) => `${image.source}:${image.id}`),
        afterMessages: afterMessages.map((m) => `${m.role}: ${m.text}`),
        afterSession: afterSession ?? "none",
        transcriptGone,
        sessionsGone,
        preservedImages: [
          `builder:${builderAfter?.id} messageText=${JSON.stringify(builderAfter?.messageText)}`,
          `searched:${searchedAfter?.id} messageText=${JSON.stringify(searchedAfter?.messageText)}`,
        ],
        attachmentFiles,
      }),
      "utf8",
    );
    await rm(rootDir, { recursive: true, force: true });
  });
});

function renderEvidenceHtml(data: {
  closedMarkup: string;
  confirmationMarkup: string;
  beforeMessages: string[];
  beforeSession: string | undefined;
  beforeImages: string[];
  afterMessages: string[];
  afterSession: string;
  transcriptGone: boolean;
  sessionsGone: boolean;
  preservedImages: string[];
  attachmentFiles: string[];
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset Conversation Evidence</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f1e5; color: #1d2433; }
    main { max-width: 980px; margin: 0 auto; padding: 32px; }
    h1 { margin: 0 0 8px; font-size: 32px; }
    p { line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: #fffaf0; border: 2px solid #2a6fdb; border-radius: 18px; padding: 18px; box-shadow: 0 8px 0 rgba(29, 36, 51, 0.12); }
    .surface { background: white; border: 1px solid #d8cab2; border-radius: 14px; padding: 16px; overflow-wrap: anywhere; }
    .hb-button { border: 2px solid #1d2433; border-radius: 999px; padding: 10px 14px; background: #fff; font-weight: 700; }
    .hb-button-danger { background: #c7422f; color: white; }
    .hb-reset-confirm { border: 2px dashed #c7422f; border-radius: 14px; padding: 14px; }
    .hb-reset-kept, .pass { color: #17683a; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; border-bottom: 1px solid #d8cab2; padding: 10px; vertical-align: top; }
    code { background: #efe4d0; padding: 2px 5px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <h1>Parent Reset Conversation Evidence</h1>
    <p>This artifact was generated by rendering the reset control and exercising <code>ConversationService.resetConversation</code> against seeded profile conversation state.</p>
    <section class="grid">
      <article class="card">
        <h2>Grown-up menu control</h2>
        <div class="surface">${data.closedMarkup}</div>
      </article>
      <article class="card">
        <h2>Irreversible confirmation</h2>
        <div class="surface">${data.confirmationMarkup}</div>
      </article>
    </section>
    <section class="card">
      <h2>Persisted state before and after reset</h2>
      <table>
        <tr><th>Check</th><th>Before reset</th><th>After reset</th></tr>
        <tr><td>Chat transcript</td><td>${list(data.beforeMessages)}</td><td class="pass">${data.afterMessages.length === 0 ? "empty" : list(data.afterMessages)}</td></tr>
        <tr><td>Bit session state</td><td>${escapeHtml(data.beforeSession ?? "none")}</td><td class="pass">${escapeHtml(data.afterSession)}</td></tr>
        <tr><td>Transcript file removed</td><td>present</td><td class="pass">${String(data.transcriptGone)}</td></tr>
        <tr><td>Bit sessions folder removed</td><td>present</td><td class="pass">${String(data.sessionsGone)}</td></tr>
        <tr><td>Picture ids in library</td><td>${list(data.beforeImages)}</td><td class="pass">${list(data.preservedImages)}</td></tr>
        <tr><td>Attachment files preserved</td><td colspan="2" class="pass">${list(data.attachmentFiles)}</td></tr>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function list(items: string[]): string {
  if (items.length === 0) return "none";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
