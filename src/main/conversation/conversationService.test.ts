import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapLayout, profileConversationPaths } from "../storage/layout";
import { ConversationService } from "./conversationService";

async function createService() {
  const root = await mkdtemp(join(tmpdir(), "hibit-conversation-"));
  const layout = await bootstrapLayout(root);
  const service = new ConversationService(layout, () => new Date("2026-01-02T03:04:10.000Z"));
  return { layout, service };
}

describe("ConversationService", () => {
  it("returns an empty transcript before any messages", async () => {
    const { service } = await createService();
    await expect(service.readTranscript("ada")).resolves.toEqual([]);
  });

  it("appends and reads back a continuous profile transcript", async () => {
    const { service } = await createService();
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "make a cat game",
      createdAt: "2026-01-02T03:04:10.000Z",
    });
    await service.appendMessage("ada", {
      id: "a1",
      role: "assistant",
      text: "On it! 🐱",
      createdAt: "2026-01-02T03:04:11.000Z",
      projectId: "project_cat",
    });

    await expect(service.readTranscript("ada")).resolves.toEqual([
      {
        id: "u1",
        role: "user",
        text: "make a cat game",
        createdAt: "2026-01-02T03:04:10.000Z",
      },
      {
        id: "a1",
        role: "assistant",
        text: "On it! 🐱",
        createdAt: "2026-01-02T03:04:11.000Z",
        projectId: "project_cat",
      },
    ]);
  });

  it("keeps transcripts isolated per profile", async () => {
    const { service } = await createService();
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "hi",
      createdAt: "2026-01-02T03:04:10.000Z",
    });
    await expect(service.readTranscript("sam")).resolves.toEqual([]);
  });

  it("persists and reloads the active bit session file", async () => {
    const { service, layout } = await createService();
    await expect(service.getBitSessionFile("ada")).resolves.toBeUndefined();

    const sessionFile = join(profileConversationPaths(layout, "ada").bitSessionsDir, "s1.jsonl");
    await service.setBitSessionFile("ada", sessionFile);
    await expect(service.getBitSessionFile("ada")).resolves.toBe(sessionFile);

    const state = JSON.parse(
      await readFile(profileConversationPaths(layout, "ada").conversationStatePath, "utf8"),
    );
    expect(state).toMatchObject({ schemaVersion: 1, activeBitSessionFile: sessionFile });
  });

  it("exposes the conversation paths for a profile", async () => {
    const { service, layout } = await createService();
    expect(service.paths("ada")).toEqual(profileConversationPaths(layout, "ada"));
  });

  it("stores an attached picture on disk and keeps its base64 out of the transcript", async () => {
    const { service, layout } = await createService();
    const data = Buffer.from("pretend-png-bytes").toString("base64");
    const saved = await service.saveAttachment("ada", { mimeType: "image/png", data });

    expect(saved.mimeType).toBe("image/png");
    expect(saved.path).toMatch(/^attachments\/.+\.png$/);
    expect(saved.data).toBeUndefined();

    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "what is this?",
      createdAt: "2026-01-02T03:04:10.000Z",
      image: saved,
    });

    const raw = await readFile(profileConversationPaths(layout, "ada").transcriptPath, "utf8");
    expect(raw).not.toContain(data);
    expect(raw).toContain(saved.path);
  });

  it("rehydrates an attached picture's bytes when reading the transcript back", async () => {
    const { service } = await createService();
    const data = Buffer.from("pretend-png-bytes").toString("base64");
    const saved = await service.saveAttachment("ada", { mimeType: "image/png", data });
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "what is this?",
      createdAt: "2026-01-02T03:04:10.000Z",
      image: saved,
    });

    const [message] = await service.readTranscript("ada");
    expect(message.image).toEqual({ mimeType: "image/png", data, path: saved.path });
  });

  it("survives a missing attachment file without dropping the message", async () => {
    const { service } = await createService();
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "look",
      createdAt: "2026-01-02T03:04:10.000Z",
      image: { mimeType: "image/png", path: "attachments/gone.png" },
    });

    const [message] = await service.readTranscript("ada");
    expect(message.text).toBe("look");
    expect(message.image?.data).toBeUndefined();
  });
});
