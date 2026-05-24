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

  it("persists and reloads the active mayor session file", async () => {
    const { service, layout } = await createService();
    await expect(service.getMayorSessionFile("ada")).resolves.toBeUndefined();

    const sessionFile = join(profileConversationPaths(layout, "ada").mayorSessionsDir, "s1.jsonl");
    await service.setMayorSessionFile("ada", sessionFile);
    await expect(service.getMayorSessionFile("ada")).resolves.toBe(sessionFile);

    const state = JSON.parse(
      await readFile(profileConversationPaths(layout, "ada").conversationStatePath, "utf8"),
    );
    expect(state).toMatchObject({ schemaVersion: 1, activeMayorSessionFile: sessionFile });
  });

  it("exposes the conversation paths for a profile", async () => {
    const { service, layout } = await createService();
    expect(service.paths("ada")).toEqual(profileConversationPaths(layout, "ada"));
  });
});
