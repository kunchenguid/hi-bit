import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultHiBitConfig } from "@shared/config";
import { describe, expect, it } from "vitest";
import {
  assertSafeId,
  bootstrapLayout,
  buildLayout,
  profileConversationDir,
  profileConversationPaths,
  projectDir,
} from "./layout";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hibit-layout-"));
}

describe("bootstrapLayout", () => {
  it("creates the robot-factory local-first app layout", async () => {
    const root = await tempRoot();
    const layout = await bootstrapLayout(root, () => new Date("2026-01-02T03:04:05.000Z"));

    await expect(stat(layout.authDir)).resolves.toBeTruthy();
    await expect(stat(layout.piAgentDir)).resolves.toBeTruthy();
    await expect(stat(layout.factoriesDir)).resolves.toBeTruthy();
    // No shared default factory anymore - factories are created per kid.
    await expect(stat(join(layout.factoriesDir, "default"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(projectDir(layout, "ada", "sample"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const home = JSON.parse(await readFile(layout.homePath, "utf8"));
    expect(home).toEqual({
      schemaVersion: 1,
      layoutVersion: 2,
    });

    const config = JSON.parse(await readFile(layout.configPath, "utf8"));
    expect(config).toEqual(defaultHiBitConfig());
  });
});

describe("profileConversationPaths", () => {
  it("places the transcript and bit sessions under the profile conversation dir", async () => {
    const root = await tempRoot();
    const layout = await bootstrapLayout(root);

    const dir = profileConversationDir(layout, "ada");
    expect(dir).toBe(join(profileDirFor(layout, "ada"), "conversation"));

    const paths = profileConversationPaths(layout, "ada");
    expect(paths).toEqual({
      profileRoot: profileDirFor(layout, "ada"),
      conversationDir: dir,
      transcriptPath: join(dir, "transcript.jsonl"),
      bitSessionsDir: join(dir, "sessions", "bit"),
      conversationStatePath: join(dir, "conversation.json"),
      attachmentsDir: join(dir, "attachments"),
      attachmentsIndexPath: join(dir, "attachments", "index.jsonl"),
    });
  });

  it("rejects path traversal profile ids", () => {
    const layout = buildLayout("/tmp/hi-bit");
    expect(() => profileConversationDir(layout, "../secret")).toThrow(/Invalid profile id/);
  });
});

function profileDirFor(layout: ReturnType<typeof buildLayout>, profileId: string): string {
  return join(layout.factoriesDir, profileId);
}

describe("assertSafeId", () => {
  it("rejects path traversal ids", () => {
    expect(assertSafeId("abc_123-DEF")).toBe("abc_123-DEF");
    expect(() => assertSafeId("../secret", "project id")).toThrow(/Invalid project id/);
    expect(() => assertSafeId("with/slash", "project id")).toThrow(/Invalid project id/);
  });
});
