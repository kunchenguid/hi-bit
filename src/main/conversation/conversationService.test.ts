import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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

  it("gives each saved picture a stable id and recalls it later", async () => {
    const { service } = await createService();
    const first = await service.saveAttachment("ada", {
      mimeType: "image/png",
      data: Buffer.from("first").toString("base64"),
    });
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "a cat",
      createdAt: "2026-01-02T03:04:10.000Z",
      image: first,
    });
    const second = await service.saveAttachment("ada", {
      mimeType: "image/jpeg",
      data: Buffer.from("second").toString("base64"),
    });
    await service.appendMessage("ada", {
      id: "u2",
      role: "user",
      text: "a dog",
      createdAt: "2026-01-02T03:05:10.000Z",
      image: second,
    });

    expect(first.id).toBeTruthy();
    expect(second.id).not.toBe(first.id);

    // Newest first, with mime + path + when shared, so Bit can pick the right one.
    const listed = await service.listAttachments("ada");
    expect(listed).toEqual([
      {
        id: second.id,
        mimeType: "image/jpeg",
        path: second.path,
        sharedAt: "2026-01-02T03:05:10.000Z",
      },
      {
        id: first.id,
        mimeType: "image/png",
        path: first.path,
        sharedAt: "2026-01-02T03:04:10.000Z",
      },
    ]);

    const resolved = await service.resolveAttachment("ada", first.id as string);
    expect(resolved).toMatchObject({ id: first.id, path: first.path, mimeType: "image/png" });
    expect(await service.resolveAttachment("ada", "no-such-id")).toBeUndefined();
  });

  it("recalls a legacy attachment with no stored id by its file name", async () => {
    const { service } = await createService();
    // A transcript line written before ids existed: image has a path but no id.
    await service.appendMessage("ada", {
      id: "u1",
      role: "user",
      text: "old picture",
      createdAt: "2026-01-02T03:04:10.000Z",
      image: { mimeType: "image/png", path: "attachments/legacy-uuid.png" },
    });

    const listed = await service.listAttachments("ada");
    expect(listed).toEqual([
      {
        id: "legacy-uuid",
        mimeType: "image/png",
        path: "attachments/legacy-uuid.png",
        sharedAt: "2026-01-02T03:04:10.000Z",
      },
    ]);
    expect(await service.resolveAttachment("ada", "legacy-uuid")).toBeTruthy();
  });

  it("rejects unsupported attachment mime types", async () => {
    const { service } = await createService();
    const data = Buffer.from("pretend-svg-bytes").toString("base64");

    await expect(
      service.saveAttachment("ada", { mimeType: "image/svg+xml", data }),
    ).rejects.toThrow("Unsupported image type.");
  });

  it("rejects malformed base64 attachment data", async () => {
    const { service } = await createService();

    await expect(
      service.saveAttachment("ada", { mimeType: "image/png", data: "%%%" }),
    ).rejects.toThrow("Invalid image data.");
  });

  it("rejects missing attachment data", async () => {
    const { service } = await createService();

    await expect(service.saveAttachment("ada", { mimeType: "image/png" } as never)).rejects.toThrow(
      "Invalid image data.",
    );
  });

  it("rejects attachments that are too large after decoding", async () => {
    const { service } = await createService();
    const data = Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");

    await expect(service.saveAttachment("ada", { mimeType: "image/jpeg", data })).rejects.toThrow(
      "Image is too large.",
    );
  });

  it("rejects attachments with impossible encoded size before decoding", async () => {
    const { service } = await createService();
    const data = "A".repeat(Math.ceil((5 * 1024 * 1024 + 1) / 3) * 4);
    const from = vi.spyOn(Buffer, "from").mockImplementation(() => {
      throw new Error("decoded before size check");
    });

    try {
      await expect(service.saveAttachment("ada", { mimeType: "image/jpeg", data })).rejects.toThrow(
        "Image is too large.",
      );
      expect(from).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
    }
  });

  it("rejects oversized encoded attachments before scanning base64 shape", async () => {
    const { service } = await createService();
    const data = "A".repeat(Math.ceil((5 * 1024 * 1024 + 1) / 3) * 4);
    const test = vi.spyOn(RegExp.prototype, "test");

    try {
      await expect(service.saveAttachment("ada", { mimeType: "image/jpeg", data })).rejects.toThrow(
        "Image is too large.",
      );
      expect(test).not.toHaveBeenCalled();
    } finally {
      test.mockRestore();
    }
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
    expect(message.image).toEqual({ id: saved.id, mimeType: "image/png", data, path: saved.path });
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
