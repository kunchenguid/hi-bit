import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParentFlag } from "@shared/flag";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteFlag, flagFileNameFor, listFlags, loadFlags, readFlag, writeFlag } from "./flags";
import { bootstrapLayout, bootstrapProfileDirs, profilePathsFor } from "./layout";

describe("parent flags storage", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-flags-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeFlag(overrides: Partial<ParentFlag> = {}): ParentFlag {
    return {
      flaggedAt: "2026-04-23T10:15:00.000Z",
      sessionId: "sess-kid-1",
      messageTimestamp: "2026-04-23T09:45:00.000Z",
      messageRole: "kid",
      messageKind: "assistant_message",
      messageText: "lol just write it for you",
      reason: "do not write it without teaching",
      ...overrides,
    };
  }

  it("composes a filename of <timestamp>-<hash>.md safe for the filesystem", () => {
    const name = flagFileNameFor(makeFlag());
    expect(name).toMatch(/^2026-04-23T10-15-00-000Z-[0-9a-f]{8}\.md$/);
  });

  it("is deterministic for the same flag content", () => {
    expect(flagFileNameFor(makeFlag())).toBe(flagFileNameFor(makeFlag()));
  });

  it("differentiates flags on different messages even at the same timestamp", () => {
    const a = flagFileNameFor(makeFlag({ messageText: "one" }));
    const b = flagFileNameFor(makeFlag({ messageText: "two" }));
    expect(a).not.toBe(b);
  });

  it("writes a flag file and roundtrips all fields through readFlag", async () => {
    const flag = makeFlag();
    const name = await writeFlag(paths, flag);
    const loaded = await readFlag(paths, name);
    expect(loaded).toEqual(flag);
  });

  it("roundtrips messageText containing newlines, quotes, and angle brackets", async () => {
    const flag = makeFlag({
      messageText: "here's a snippet:\n\n  <script>alert('oops')</script>\n",
      reason: "do not put XSS in examples",
    });
    const name = await writeFlag(paths, flag);
    const loaded = await readFlag(paths, name);
    expect(loaded.messageText).toBe(flag.messageText);
    expect(loaded.reason).toBe(flag.reason);
  });

  it("rejects an empty messageText", async () => {
    await expect(writeFlag(paths, makeFlag({ messageText: "" }))).rejects.toThrow();
  });

  it("rejects an empty reason", async () => {
    await expect(writeFlag(paths, makeFlag({ reason: "" }))).rejects.toThrow();
  });

  it("lists saved flags sorted by filename (chronological by flaggedAt)", async () => {
    await writeFlag(paths, makeFlag({ flaggedAt: "2026-04-23T10:00:00.000Z", messageText: "a" }));
    await writeFlag(paths, makeFlag({ flaggedAt: "2026-04-23T11:00:00.000Z", messageText: "b" }));
    await writeFlag(paths, makeFlag({ flaggedAt: "2026-04-23T09:00:00.000Z", messageText: "c" }));
    const names = await listFlags(paths);
    expect(names).toHaveLength(3);
    expect(names[0]?.startsWith("2026-04-23T09-")).toBe(true);
    expect(names[2]?.startsWith("2026-04-23T11-")).toBe(true);
  });

  it("returns an empty array when the flags directory is missing", async () => {
    const missing = { ...paths, flagsDir: join(root, "never-created-flags") };
    expect(await listFlags(missing)).toEqual([]);
  });

  it("skips non-md files when listing", async () => {
    await writeFlag(paths, makeFlag());
    await writeFile(join(paths.flagsDir, "README.txt"), "ignore me", "utf8");
    const names = await listFlags(paths);
    expect(names).toHaveLength(1);
    expect(names[0]?.endsWith(".md")).toBe(true);
  });

  it("loadFlags returns every saved flag in chronological order", async () => {
    const first = makeFlag({ flaggedAt: "2026-04-23T09:00:00.000Z", messageText: "first" });
    const second = makeFlag({ flaggedAt: "2026-04-23T10:00:00.000Z", messageText: "second" });
    await writeFlag(paths, second);
    await writeFlag(paths, first);
    const loaded = await loadFlags(paths);
    expect(loaded.map((f) => f.messageText)).toEqual(["first", "second"]);
  });

  it("loadFlags returns empty when no flags exist", async () => {
    expect(await loadFlags(paths)).toEqual([]);
  });

  it("throws when reading a flag file with no frontmatter", async () => {
    await writeFile(join(paths.flagsDir, "malformed.md"), "just a body\n", "utf8");
    await expect(readFlag(paths, "malformed.md")).rejects.toThrow(/frontmatter/);
  });

  it("deleteFlag removes the matching flag file from disk", async () => {
    const flag = makeFlag();
    await writeFlag(paths, flag);
    expect(await listFlags(paths)).toHaveLength(1);
    await deleteFlag(paths, flag);
    expect(await listFlags(paths)).toHaveLength(0);
  });

  it("deleteFlag is idempotent when the flag file is already missing", async () => {
    await expect(deleteFlag(paths, makeFlag())).resolves.toBeUndefined();
  });

  it("deleteFlag leaves other saved flags intact", async () => {
    const keep = makeFlag({ messageText: "keep me" });
    const drop = makeFlag({ messageText: "drop me" });
    await writeFlag(paths, keep);
    await writeFlag(paths, drop);
    await deleteFlag(paths, drop);
    const remaining = await loadFlags(paths);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.messageText).toBe("keep me");
  });

  it("throws when reading a flag whose frontmatter has an invalid messageRole", async () => {
    const yaml = [
      "---",
      "flaggedAt: 2026-04-23T10:00:00.000Z",
      "sessionId: s",
      "messageTimestamp: 2026-04-23T09:00:00.000Z",
      "messageRole: robot",
      "messageKind: assistant_message",
      "messageText: x",
      "reason: x",
      "---",
      "",
    ].join("\n");
    await writeFile(join(paths.flagsDir, "bad-role.md"), yaml, "utf8");
    await expect(readFlag(paths, "bad-role.md")).rejects.toThrow(/messageRole/);
  });
});
