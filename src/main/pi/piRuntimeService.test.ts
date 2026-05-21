import { describe, expect, it } from "vitest";
import type { RuntimeProject } from "../projects/projectService";
import { PiRuntimeService, type RuntimePiSession } from "./piRuntimeService";

function project(): RuntimeProject {
  return {
    schemaVersion: 1,
    id: "project-1",
    factoryId: "default",
    profileId: "ada",
    title: "Project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectDir: "/tmp/project",
    projectJsonPath: "/tmp/project/project.json",
    mainWorkbenchDir: "/tmp/project/main-workbench",
    workbenchesDir: "/tmp/project/workbenches",
    bitSessionsDir: "/tmp/project/sessions/bit",
    botSessionsDir: "/tmp/project/sessions/bots",
    buildPlansDir: "/tmp/project/build-plans",
    botJobsDir: "/tmp/project/jobs",
    machinesDir: "/tmp/project/machines",
    assemblyLineDir: "/tmp/project/assembly-line",
    savePointsDir: "/tmp/project/save-points",
    projectLogbookPath: "/tmp/project/logbook/project.jsonl",
  };
}

class FakeSession implements RuntimePiSession {
  sessionId = "session-1";
  sessionFile = "/tmp/project/pi-sessions/session.jsonl";
  messages: unknown[] = [];
  accessTokens: string[] = [];
  blockPrompt = false;
  private listeners: Array<(event: unknown) => void> = [];
  private aborted = false;
  private unblock: (() => void) | undefined;

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  setAccessToken(accessToken: string): void {
    this.accessTokens.push(accessToken);
  }

  async prompt(text: string): Promise<void> {
    this.messages.push({ role: "user", content: text, timestamp: 1 });
    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Done" },
    });
    if (this.blockPrompt) {
      await new Promise<void>((resolve) => {
        this.unblock = resolve;
      });
    }
    if (this.aborted) throw new Error("aborted");
    this.messages.push({
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
      timestamp: 2,
    });
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.unblock?.();
  }

  dispose(): void {}

  private emit(event: unknown): void {
    for (const listener of this.listeners) listener(event);
  }
}

describe("PiRuntimeService", () => {
  it("creates a warm Pi session, injects fresh Codex tokens, and streams normalized events", async () => {
    const fakeSession = new FakeSession();
    const events: unknown[] = [];
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => `token-${fakeSession.accessTokens.length + 1}`,
      createSession: async () => fakeSession,
    });

    const first = await service.sendPrompt(project(), "Make a page", (event) => events.push(event));
    const second = await service.sendPrompt(project(), "Change color", (event) =>
      events.push(event),
    );

    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    expect(fakeSession.accessTokens).toEqual(["token-1", "token-2"]);
    expect(events).toContainEqual({
      type: "turn_start",
      projectId: "project-1",
      turnId: first.turnId,
    });
    expect(events).toContainEqual({
      type: "assistant_delta",
      projectId: "project-1",
      turnId: first.turnId,
      text: "Done",
    });
    expect(events).toContainEqual({
      type: "turn_end",
      projectId: "project-1",
      turnId: second.turnId,
      status: "completed",
    });
    expect(service.getMessages("project-1")).toHaveLength(4);
  });

  it("marks a running turn as cancelled when abort is requested", async () => {
    const fakeSession = new FakeSession();
    fakeSession.blockPrompt = true;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async () => fakeSession,
    });

    const run = service.sendPrompt(project(), "Stop soon", () => {});
    await new Promise((resolve) => setImmediate(resolve));
    await service.abort("project-1");
    const result = await run;

    expect(result.status).toBe("cancelled");
  });

  it("keys warm sessions by bot runtime key when a bot works in its own workbench", async () => {
    const sessions: FakeSession[] = [];
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async () => {
        const session = new FakeSession();
        sessions.push(session);
        return session;
      },
    });

    await service.sendPrompt({ ...project(), runtimeKey: "bot_job_1" }, "First bot", () => {});
    await service.sendPrompt({ ...project(), runtimeKey: "bot_job_2" }, "Second bot", () => {});

    expect(sessions).toHaveLength(2);
    expect(service.getMessages("bot_job_1")).toHaveLength(2);
    expect(service.getMessages("bot_job_2")).toHaveLength(2);
  });
});
