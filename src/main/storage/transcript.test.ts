import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptEvent } from "@shared/transcript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, bootstrapProfileDirs, profilePathsFor } from "./layout";
import { appendTranscriptEvent, readTranscript, transcriptFileFor } from "./transcript";

describe("transcript jsonl", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-transcript-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeEvent(overrides: Partial<TranscriptEvent> = {}): TranscriptEvent {
    return {
      timestamp: "2026-04-23T10:00:00.000Z",
      role: "kid",
      sessionId: "sess-1",
      kind: "user_message",
      text: "hi bit",
      ...overrides,
    };
  }

  it("composes the transcript file path under the transcripts dir", () => {
    const file = transcriptFileFor(paths, "sess-1");
    expect(file).toBe(join(paths.transcriptsDir, "sess-1.jsonl"));
  });

  it("rejects an empty sessionId when composing the transcript path", () => {
    expect(() => transcriptFileFor(paths, "")).toThrow(/sessionId/);
  });

  it("appends a single event as a trailing-newline json line", async () => {
    const event = makeEvent();
    await appendTranscriptEvent(paths, event);
    const raw = await readFile(transcriptFileFor(paths, event.sessionId), "utf8");
    expect(raw).toBe(`${JSON.stringify(event)}\n`);
  });

  it("keeps kid and parent sessions in separate files", async () => {
    const kid = makeEvent({ sessionId: "sess-kid", role: "kid", text: "hi" });
    const parent = makeEvent({
      sessionId: "sess-parent",
      role: "parent",
      text: "how is ada doing?",
    });
    await appendTranscriptEvent(paths, kid);
    await appendTranscriptEvent(paths, parent);
    const kidEvents = await readTranscript(paths, "sess-kid");
    const parentEvents = await readTranscript(paths, "sess-parent");
    expect(kidEvents).toEqual([kid]);
    expect(parentEvents).toEqual([parent]);
  });

  it("roundtrips multiple event kinds preserving order and optional fields", async () => {
    const user = makeEvent({ kind: "user_message", text: "make a red button" });
    const toolCall = makeEvent({
      timestamp: "2026-04-23T10:00:01.000Z",
      kind: "tool_call",
      text: "editing index.html",
      toolName: "Edit",
      metadata: { file: "index.html" },
    });
    const assistant = makeEvent({
      timestamp: "2026-04-23T10:00:02.000Z",
      kind: "assistant_message",
      text: "done!",
    });
    await appendTranscriptEvent(paths, user);
    await appendTranscriptEvent(paths, toolCall);
    await appendTranscriptEvent(paths, assistant);
    const events = await readTranscript(paths, "sess-1");
    expect(events).toEqual([user, toolCall, assistant]);
  });

  it("returns an empty array when the transcript file does not exist yet", async () => {
    const events = await readTranscript(paths, "never-started");
    expect(events).toEqual([]);
  });

  it("tolerates trailing blank lines when reading", async () => {
    const event = makeEvent();
    await appendTranscriptEvent(paths, event);
    await appendTranscriptEvent(paths, event);
    const events = await readTranscript(paths, event.sessionId);
    expect(events).toHaveLength(2);
  });
});
