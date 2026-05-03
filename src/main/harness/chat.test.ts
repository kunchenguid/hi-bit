import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HiBitConfig } from "@shared/config";
import type { AcpRuntimeEvent } from "acpx/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapLayout, type HiBitLayout, profilePathsFor } from "../storage/layout";
import { createProfile, readProgress, setCurrentDream } from "../storage/profiles";
import { scaffoldProject } from "../storage/projects";
import { promptsBitPath } from "../storage/prompts";
import { readSessionLogEntries } from "../storage/sessionLog";
import { readTranscript } from "../storage/transcript";
import { requestCursorMarker, sendKidMessage, sendParentMessage } from "./chat";

type RuntimeOutput =
  | { status?: "completed"; text: string; used?: number }
  | { status: "failed"; text?: string; error: string };

async function* asyncEvents(output: RuntimeOutput): AsyncGenerator<AcpRuntimeEvent, void, unknown> {
  if ("used" in output && typeof output.used === "number") {
    yield { type: "status", text: "usage", used: output.used, size: 1000 };
  }
  if (output.text) yield { type: "text_delta", text: output.text };
}

function runtimeFactoryFor(outputs: RuntimeOutput[]) {
  const prompts: string[] = [];
  const ensureSessionInputs: unknown[] = [];
  let index = 0;
  const runtimeFactory = vi.fn(() => ({
    ensureSession: vi.fn(async (input: unknown) => {
      ensureSessionInputs.push(input);
      return { sessionKey: "s", backend: "acpx", runtimeSessionName: "runtime" };
    }),
    startTurn: vi.fn((input: unknown) => {
      const turnInput = input as { text: string; requestId: string };
      prompts.push(turnInput.text);
      const output = outputs[Math.min(index, outputs.length - 1)] ?? { text: "" };
      index += 1;
      return {
        requestId: turnInput.requestId,
        events: asyncEvents(output),
        result: Promise.resolve(
          output.status === "failed"
            ? { status: "failed" as const, error: { message: output.error } }
            : { status: "completed" as const },
        ),
        cancel: vi.fn(async () => {}),
        closeStream: vi.fn(async () => {}),
      };
    }),
    close: vi.fn(async () => {}),
  }));
  return { runtimeFactory, prompts, ensureSessionInputs };
}

const config: HiBitConfig = { version: 2, defaultAgent: "claude" };

describe("ACP-backed chat", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-chat-acp-"));
    layout = await bootstrapLayout(root);
    await writeFile(
      promptsBitPath(layout),
      "# Bit - System Prompt v1\n\nTest Bit prompt.\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("sends a kid turn through ACPX, writes transcript and session log", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const { runtimeFactory, prompts, ensureSessionInputs } = runtimeFactoryFor([
      { text: "Hi Ada.", used: 42 },
    ]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "hello",
      runtimeFactory,
    });

    expect(result).toEqual({ ok: true, text: "Hi Ada.", durationMs: expect.any(Number) });
    expect(prompts[0]).toContain("<hi-bit:context>");
    expect(prompts[0]).toContain("mode: kid");
    expect(prompts[0]).toMatch(/hello$/);
    expect(ensureSessionInputs[0]).toMatchObject({
      agent: "claude",
      mode: "persistent",
      cwd: profilePathsFor(layout, profile.id).root,
    });

    const paths = profilePathsFor(layout, profile.id);
    const events = await readTranscript(paths, profile.sessions.kid);
    expect(events.map((event) => event.kind)).toEqual(["user_message", "assistant_message"]);
    expect(events[0]?.text).toBe("hello");
    expect(events[1]?.text).toBe("Hi Ada.");
    const log = await readSessionLogEntries(paths);
    expect(log[0]).toMatchObject({
      harness: "claude",
      role: "kid",
      sessionId: profile.sessions.kid,
      mode: "start",
      exitCode: 0,
      tokensInput: 42,
    });
  });

  it("strips hidden progress blocks from replies and applies valid progress updates", async () => {
    await writeFile(
      join(layout.graphNodesDir, "html-text-headings.yml"),
      [
        "id: html-text-headings",
        "title_parent: Headings",
        "title_kid: big titles",
        "area: html",
        "prereqs: []",
        "introduces: []",
        "mastery_signals:",
        "  saw_it: saw",
        "  did_with_help: did",
        "  did_unprompted: unprompted",
        "  explained_it: explained",
        "",
      ].join("\n"),
      "utf8",
    );
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const rawReply =
      'Nice title.<hi-bit:progress>[{"kpId":"html-text-headings","status":"did_with_help","evidence":"Changed the h1."}]</hi-bit:progress>';
    const { runtimeFactory } = runtimeFactoryFor([{ text: rawReply }]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "done",
      runtimeFactory,
    });

    expect(result).toEqual({ ok: true, text: "Nice title.", durationMs: expect.any(Number) });
    const events = await readTranscript(profilePathsFor(layout, profile.id), profile.sessions.kid);
    expect(events[1]?.text).toBe("Nice title.");
    const progress = await readProgress(layout, profile.id);
    expect(progress.knowledgePoints["html-text-headings"]).toMatchObject({
      status: "did_with_help",
      evidence: "Changed the h1.",
    });
  });

  it("does not inject the full preamble on resume turns", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const { runtimeFactory, prompts } = runtimeFactoryFor([{ text: "one" }, { text: "two" }]);

    await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "first",
      runtimeFactory,
    });
    await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "second",
      runtimeFactory,
    });

    expect(prompts[0]).toContain("<hi-bit:context>");
    expect(prompts[1]).toBe("second");
    const log = await readSessionLogEntries(profilePathsFor(layout, profile.id));
    expect(log.map((entry) => entry.mode)).toEqual(["start", "resume"]);
  });

  it("requestCursorMarker does not write helper turns to transcript or session log", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const { runtimeFactory, prompts } = runtimeFactoryFor([
      { text: JSON.stringify({ surrounding_content_with_marker: "<h1>[[BIT-CURSOR]]</h1>" }) },
    ]);

    const result = await requestCursorMarker({
      layout,
      config,
      profileId: profile.id,
      request: {
        filename: "index.html",
        editorContent: "<h1>Hello</h1>",
        latestBitMessage: "Change the title.",
        snippet: "<h1>Ada</h1>",
      },
      runtimeFactory,
    });

    expect(result.ok).toBe(true);
    expect(prompts[0]).toContain("Change the title.");
    const paths = profilePathsFor(layout, profile.id);
    await expect(readTranscript(paths, profile.sessions.kid)).resolves.toEqual([]);
    await expect(readSessionLogEntries(paths)).resolves.toEqual([]);
  });

  it("injects current dream project files on a fresh dream session", async () => {
    await writeFile(
      join(layout.graphNodesDir, "html-doc-shell.yml"),
      [
        "id: html-doc-shell",
        "title_parent: Document shell",
        "title_kid: page frame",
        "area: html",
        "prereqs: []",
        "introduces: []",
        "mastery_signals:",
        "  saw_it: saw",
        "  did_with_help: did",
        "  did_unprompted: unprompted",
        "  explained_it: explained",
        "",
      ].join("\n"),
      "utf8",
    );
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const dream = {
      id: "about-me",
      title_parent: "About Me",
      title_kid: "a page about you",
      summary_kid: "make a page",
      categories: ["personal" as const],
      interest_tags: [],
      requires: ["html-doc-shell"],
      style_hints: [],
      emoji: "*",
    };
    await setCurrentDream(layout, profile.id, dream.id);
    const paths = profilePathsFor(layout, profile.id);
    await scaffoldProject(paths, dream, { profileName: profile.name });
    const updatedProfile = await (await import("../storage/profiles")).readProfile(
      layout,
      profile.id,
    );
    if (!updatedProfile) throw new Error("missing profile");
    const { runtimeFactory, prompts } = runtimeFactoryFor([{ text: "ready" }]);

    await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "start",
      runtimeFactory,
    });

    expect(prompts[0]).toContain(`project_dir: ${join(paths.root, "projects", "about-me")}`);
    expect(prompts[0]).toContain('project_files: ["index.html"]');
  });

  it("runs parent turns against the parent session and role", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const { runtimeFactory, prompts } = runtimeFactoryFor([{ text: "Parent summary." }]);

    const result = await sendParentMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "summarize",
      runtimeFactory,
    });

    expect(result).toEqual({ ok: true, text: "Parent summary.", durationMs: expect.any(Number) });
    expect(prompts[0]).toContain("mode: parent");
    const paths = profilePathsFor(layout, profile.id);
    const parentEvents = await readTranscript(paths, profile.sessions.parent);
    expect(parentEvents.map((event) => event.role)).toEqual(["parent", "parent"]);
    const log = await readSessionLogEntries(paths);
    expect(log[0]).toMatchObject({ role: "parent", sessionId: profile.sessions.parent });
  });

  it("returns ok=false when no default agent is configured", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });

    const result = await sendKidMessage({
      layout,
      config: { version: 2 },
      profileId: profile.id,
      prompt: "hello",
      runtimeFactory: runtimeFactoryFor([{ text: "unused" }]).runtimeFactory,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/default agent/i);
  });
});
