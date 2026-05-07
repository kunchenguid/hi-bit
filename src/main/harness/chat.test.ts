import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HiBitConfig } from "@shared/config";
import type { AcpRuntimeEvent } from "acpx/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeAcpRuntimeSessions, closeAllAcpRuntimes } from "../agent/acpxTurn";
import { bootstrapLayout, type HiBitLayout, profilePathsFor } from "../storage/layout";
import { createProfile, readProgress, setCurrentDream, updateKpStatus } from "../storage/profiles";
import { scaffoldProject } from "../storage/projects";
import { promptsBitPath } from "../storage/prompts";
import { readSessionLogEntries } from "../storage/sessionLog";
import { readTranscript } from "../storage/transcript";
import { requestCursorMarker, sendKidMessage, sendParentMessage } from "./chat";

type RuntimeOutput =
  | { status?: "completed"; text: string; used?: number; size?: number }
  | { status: "failed"; text?: string; error: string };

async function* asyncEvents(output: RuntimeOutput): AsyncGenerator<AcpRuntimeEvent, void, unknown> {
  if ("used" in output && typeof output.used === "number") {
    yield {
      type: "status",
      text: "usage",
      tag: "usage_update",
      used: output.used,
      size: output.size ?? 1000,
    };
  }
  if (output.text) yield { type: "text_delta", text: output.text };
}

function runtimeFactoryFor(outputs: RuntimeOutput[]) {
  const prompts: string[] = [];
  const ensureSessionInputs: unknown[] = [];
  const closeInputs: unknown[] = [];
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
    close: vi.fn(async (input: unknown) => {
      closeInputs.push(input);
    }),
  }));
  return { runtimeFactory, prompts, ensureSessionInputs, closeInputs };
}

const config: HiBitConfig = { version: 2, defaultAgent: "claude" };

async function writeGraphNode(layout: HiBitLayout, id: string): Promise<void> {
  await writeFile(
    join(layout.graphNodesDir, `${id}.yml`),
    [
      `id: ${id}`,
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
}

async function writeFixedDream(layout: HiBitLayout, id: string, requires: string[]): Promise<void> {
  await writeFile(
    join(layout.graphDreamsDir, `${id}.yml`),
    [
      `id: ${id}`,
      "title_parent: Test Dream",
      "title_kid: test dream",
      "summary_kid: test the dream path",
      'emoji: "*"',
      "mode: project",
      "categories: [personal]",
      "interest_tags: []",
      `requires: [${requires.join(", ")}]`,
      "style_hints: []",
      "difficulty: 1",
      "",
    ].join("\n"),
    "utf8",
  );
}

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
    await closeAllAcpRuntimes("test cleanup");
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
      contextTokensUsed: 42,
      contextTokensSize: 1000,
    });
    expect(log[0]).not.toHaveProperty("tokensInput");
    expect(log[0]).not.toHaveProperty("tokensOutput");
  });

  it("records an aborted clean ACP turn as cancelled", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const controller = new AbortController();
    controller.abort();
    const { runtimeFactory } = runtimeFactoryFor([{ text: "stale assistant text" }]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "keep going",
      signal: controller.signal,
      runtimeFactory,
    });

    expect(result).toEqual({ ok: false, error: "Turn cancelled", durationMs: expect.any(Number) });
    const paths = profilePathsFor(layout, profile.id);
    const events = await readTranscript(paths, profile.sessions.kid);
    expect(events.map((event) => event.kind)).toEqual(["user_message", "error"]);
    expect(events[1]?.text).toBe("Turn cancelled");
    const log = await readSessionLogEntries(paths);
    expect(log[0]).toMatchObject({ exitCode: null, signal: "SIGTERM" });
  });

  it("strips hidden progress blocks from replies and applies valid progress updates", async () => {
    await writeGraphNode(layout, "html-text-headings");
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const rawReply =
      'Nice title.\n\n<hi-bit:progress>[{"kpId":"html-text-headings","status":"did_with_help","evidence":"Changed the h1."}]</hi-bit:progress>\n\n';
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

  it("returns hidden expected learner actions as structured metadata", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const { runtimeFactory } = runtimeFactoryFor([
      {
        text: 'Click Split so we can see both sides.<hi-bit:expect-action>{"type":"workspace.view.split","label":"Clicked Split"}</hi-bit:expect-action>',
      },
    ]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "what next?",
      runtimeFactory,
    });

    expect(result).toEqual({
      ok: true,
      text: "Click Split so we can see both sides.",
      durationMs: expect.any(Number),
      expectedActions: [{ type: "workspace.view.split", label: "Clicked Split" }],
    });
  });

  it("does not promote run-and-preview from a hidden block unless the evidence includes a code change", async () => {
    await writeGraphNode(layout, "run-and-preview");
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    await updateKpStatus(layout, profile.id, "run-and-preview", "saw_it", {
      evidence: "Clicked See my page and saw the live preview.",
    });
    const rawReply =
      'Nice page.<hi-bit:progress>[{"kpId":"run-and-preview","status":"did_with_help","evidence":"Pressed See my page and saw My Name."}]</hi-bit:progress>';
    const { runtimeFactory } = runtimeFactoryFor([{ text: rawReply }]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "I see My Name",
      runtimeFactory,
    });

    expect(result).toEqual({ ok: true, text: "Nice page.", durationMs: expect.any(Number) });
    const progress = await readProgress(layout, profile.id);
    expect(progress.knowledgePoints["run-and-preview"]).toMatchObject({
      status: "saw_it",
      evidence: "Clicked See my page and saw the live preview.",
    });
  });

  it("removes vague name wording from first My Name edit replies", async () => {
    const profile = await createProfile(layout, { name: "Ada Lovelace", age: 8 });
    const rawReply = [
      'That "My Name" on the page came from your code.',
      "Let's change it to your actual name.",
      "Change it to:",
      "```html practice",
      "Ada Lovelace",
      "```",
    ].join("\n\n");
    const { runtimeFactory } = runtimeFactoryFor([{ text: rawReply }]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "I see My Name",
      runtimeFactory,
    });

    if (!result.ok) throw new Error(result.error);
    expect(result.text).not.toMatch(/your actual name|your real name/i);
    expect(result.text).toContain("Let's change it to Ada Lovelace.");

    const events = await readTranscript(profilePathsFor(layout, profile.id), profile.sessions.kid);
    expect(events[1]?.text).not.toMatch(/your actual name|your real name/i);
  });

  it("does not mark run-and-preview seen from a hidden block unless the evidence includes seeing the page", async () => {
    await writeGraphNode(layout, "run-and-preview");
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const rawReply =
      'Open the editor.<hi-bit:progress>[{"kpId":"run-and-preview","status":"saw_it","evidence":"Ada opened the editor for the first time."}]</hi-bit:progress>';
    const { runtimeFactory } = runtimeFactoryFor([{ text: rawReply }]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "I want to start",
      runtimeFactory,
    });

    expect(result).toEqual({ ok: true, text: "Open the editor.", durationMs: expect.any(Number) });
    const progress = await readProgress(layout, profile.id);
    expect(progress.knowledgePoints["run-and-preview"]).toBeUndefined();
  });

  it("does not mark run-and-preview seen when the evidence only says the kid is about to preview", async () => {
    await writeGraphNode(layout, "run-and-preview");
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const rawReply =
      'Press See my page.<hi-bit:progress>[{"kpId":"run-and-preview","status":"saw_it","evidence":"Ada opened the editor and is about to press See my page for the first time."}]</hi-bit:progress>';
    const { runtimeFactory } = runtimeFactoryFor([{ text: rawReply }]);

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "I see code",
      runtimeFactory,
    });

    expect(result).toEqual({
      ok: true,
      text: "Press See my page.",
      durationMs: expect.any(Number),
    });
    const progress = await readProgress(layout, profile.id);
    expect(progress.knowledgePoints["run-and-preview"]).toBeUndefined();
  });

  it("records one failed log when a post-turn progress write throws", async () => {
    await writeGraphNode(layout, "html-text-headings");
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const paths = profilePathsFor(layout, profile.id);
    await writeFile(paths.progressFile, "not json", "utf8");
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

    expect(result.ok).toBe(false);
    const log = await readSessionLogEntries(paths);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      harness: "claude",
      sessionId: profile.sessions.kid,
      mode: "start",
      exitCode: null,
      signal: null,
    });
    const events = await readTranscript(paths, profile.sessions.kid);
    expect(events.map((event) => event.kind)).toEqual(["user_message", "error"]);
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

  it("injects fresh learning-plan context on resumed kid turns", async () => {
    await writeGraphNode(layout, "run-and-preview");
    await writeFixedDream(layout, "show-me-around", ["run-and-preview"]);
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    await setCurrentDream(layout, profile.id, "show-me-around");
    await updateKpStatus(layout, profile.id, "run-and-preview", "did_with_help", {
      evidence: "Completed the tour by opening Split view.",
    });
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

    expect(prompts[1]).toContain("<hi-bit:context>");
    expect(prompts[1]).toContain("current_dream: show-me-around");
    expect(prompts[1]).toContain("next_up: none");
    expect(prompts[1]).toContain(
      "If next_up is none, the current dream path is complete. Tell the kid to click Switch dream.",
    );
    expect(prompts[1]).toContain("- run-and-preview | big titles | status: did_with_help");
    expect(prompts[1]).not.toContain("<hi-bit:memory>");
    expect(prompts[1]).not.toContain('<hi-bit:file path="state.md"');
    expect(prompts[1]).toMatch(/second$/);
  });

  it("injects the full preamble when the default agent changes", async () => {
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
      config: { version: 2, defaultAgent: "codex" },
      profileId: profile.id,
      prompt: "second",
      runtimeFactory,
    });

    expect(prompts[0]).toContain("<hi-bit:context>");
    expect(prompts[1]).toContain("<hi-bit:context>");
    expect(prompts[1]).toMatch(/second$/);
    const log = await readSessionLogEntries(profilePathsFor(layout, profile.id));
    expect(log.map((entry) => [entry.harness, entry.mode])).toEqual([
      ["claude", "start"],
      ["codex", "start"],
    ]);
  });

  it("records resume mode when a resumed turn throws", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "first",
      runtimeFactory: runtimeFactoryFor([{ text: "one" }]).runtimeFactory,
    });
    await closeAcpRuntimeSessions({
      profileId: profile.id,
      role: "kid",
      sessionId: profile.sessions.kid,
    });
    const throwingRuntimeFactory = vi.fn(() => ({
      ensureSession: vi.fn(async () => ({
        sessionKey: "s",
        backend: "acpx",
        runtimeSessionName: "runtime",
      })),
      startTurn: vi.fn(() => {
        throw new Error("ACP exploded");
      }),
      close: vi.fn(async () => {}),
    }));

    const result = await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "second",
      runtimeFactory: throwingRuntimeFactory,
    });

    expect(result.ok).toBe(false);
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

  it("requestCursorMarker uses a reusable discarded helper ACP session", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    const { runtimeFactory, ensureSessionInputs, closeInputs } = runtimeFactoryFor([
      { text: JSON.stringify({ surrounding_content_with_marker: "<h1>[[BIT-CURSOR]]</h1>" }) },
      { text: JSON.stringify({ surrounding_content_with_marker: "<p>[[BIT-CURSOR]]</p>" }) },
    ]);
    const request = {
      filename: "index.html",
      editorContent: "<h1>Hello</h1>",
      latestBitMessage: "Change the title.",
      snippet: "<h1>Ada</h1>",
    };

    await requestCursorMarker({ layout, config, profileId: profile.id, request, runtimeFactory });
    await requestCursorMarker({ layout, config, profileId: profile.id, request, runtimeFactory });

    expect(
      ensureSessionInputs.map((input) => (input as { sessionKey: string }).sessionKey),
    ).toEqual([`${profile.id}:kid:cursor-marker:claude`, `${profile.id}:kid:cursor-marker:claude`]);
    expect(
      closeInputs.map(
        (input) => (input as { discardPersistentState: boolean }).discardPersistentState,
      ),
    ).toEqual([true, true]);
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
      difficulty: 1 as const,
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

  it("keeps an empty current dream in project context", async () => {
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    await setCurrentDream(layout, profile.id, "empty-project");
    const paths = profilePathsFor(layout, profile.id);
    const { runtimeFactory, prompts } = runtimeFactoryFor([{ text: "ready" }]);

    await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "start",
      runtimeFactory,
    });

    expect(prompts[0]).toContain(`project_dir: ${join(paths.root, "projects", "empty-project")}`);
    expect(prompts[0]).toContain("project_files: []");
  });

  it("keeps freeform dreams in project context without a fixed learning plan", async () => {
    await writeFile(
      join(layout.graphDreamsDir, "playground.yml"),
      [
        "id: playground",
        "title_parent: Playground",
        "title_kid: playground",
        "summary_kid: chat with Bit about anything you are curious about",
        'emoji: "💬"',
        "mode: freeform",
        "categories: [creative]",
        "interest_tags: [chat, questions, ideas]",
        "requires: []",
        "",
      ].join("\n"),
      "utf8",
    );
    const profile = await createProfile(layout, { name: "Ada", age: 8 });
    await setCurrentDream(layout, profile.id, "playground");
    const paths = profilePathsFor(layout, profile.id);
    await scaffoldProject(
      paths,
      {
        id: "playground",
        mode: "freeform",
        title_parent: "Playground",
        title_kid: "playground",
        summary_kid: "chat with Bit about anything you are curious about",
        categories: ["creative" as const],
        interest_tags: [],
        requires: [],
        style_hints: [],
        emoji: "*",
        difficulty: 1 as const,
      },
      { profileName: profile.name },
    );
    const { runtimeFactory, prompts } = runtimeFactoryFor([{ text: "let's chat" }]);

    await sendKidMessage({
      layout,
      config,
      profileId: profile.id,
      prompt: "start",
      runtimeFactory,
    });

    expect(prompts[0]).toContain("current_dream: playground");
    expect(prompts[0]).toContain(`project_dir: ${join(paths.root, "projects", "playground")}`);
    expect(prompts[0]).toContain('project_files: ["index.html"]');
    expect(prompts[0]).not.toContain("<hi-bit:learning-plan>");
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
