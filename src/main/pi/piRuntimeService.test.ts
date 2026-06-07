import { describe, expect, it } from "vitest";
import type { RuntimeProject } from "../projects/projectService";
import { HI_BIT_ACTIVE_TOOLS } from "./piResources";
import {
  botToolNames,
  type CreateRuntimeSessionInput,
  PiRuntimeService,
  type RuntimePiSession,
} from "./piRuntimeService";

function project(): RuntimeProject {
  return {
    schemaVersion: 1,
    id: "project-1",
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
    blueprintsDir: "/tmp/project/blueprints",
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
  onPrompt: (() => void | Promise<void>) | undefined;
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
    await this.onPrompt?.();
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

describe("botToolNames", () => {
  it("includes every registered custom tool name in the allowlist, not just built-ins", () => {
    const names = botToolNames([
      { name: "generate_image" },
      { name: "process_sprite_sheet" },
    ] as never);
    // Built-ins survive...
    for (const builtin of HI_BIT_ACTIVE_TOOLS) expect(names).toContain(builtin);
    // ...and the custom tools are enabled (Pi's allowlist gates these too).
    expect(names).toContain("generate_image");
    expect(names).toContain("process_sprite_sheet");
  });
});

describe("PiRuntimeService custom tools", () => {
  it("registers the asset and web tools and enables them in the allowlist", async () => {
    let captured: CreateRuntimeSessionInput | undefined;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async (input) => {
        captured = input;
        return new FakeSession();
      },
    });

    await service.sendPrompt(project(), "Draw a sprite", () => {});

    const expected = [
      "generate_image",
      "process_sprite_sheet",
      "web_search",
      "fetch_content",
      "get_search_content",
    ];
    const toolNames = (captured?.customTools ?? []).map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining(expected));
    // The names the bot session is actually allowed to use must include them.
    const allowed = botToolNames(captured?.customTools ?? []);
    expect(allowed).toEqual(expect.arrayContaining(expected));
  });

  it("registers and allows view_bit when a mascot asset path is configured", async () => {
    let captured: CreateRuntimeSessionInput | undefined;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      mascotAssetPath: "/tmp/brand/mascot-boo.svg",
      createSession: async (input) => {
        captured = input;
        return new FakeSession();
      },
    });

    await service.sendPrompt(project(), "put Bit in my game", () => {});

    const toolNames = (captured?.customTools ?? []).map((tool) => tool.name);
    expect(toolNames).toContain("view_bit");
    expect(botToolNames(captured?.customTools ?? [])).toContain("view_bit");
  });

  it("omits view_bit when no mascot asset path is configured", async () => {
    let captured: CreateRuntimeSessionInput | undefined;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async (input) => {
        captured = input;
        return new FakeSession();
      },
    });

    await service.sendPrompt(project(), "draw a sprite", () => {});

    expect((captured?.customTools ?? []).map((tool) => tool.name)).not.toContain("view_bit");
  });
});

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
      profileId: "ada",
      projectId: "project-1",
      projectTitle: "Project",
      turnId: first.turnId,
    });
    expect(events).toContainEqual({
      type: "assistant_delta",
      profileId: "ada",
      projectId: "project-1",
      projectTitle: "Project",
      turnId: first.turnId,
      text: "Done",
    });
    expect(events).toContainEqual({
      type: "turn_end",
      profileId: "ada",
      projectId: "project-1",
      projectTitle: "Project",
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

  it("registers the builder's reference pictures for the bot's workbench while it runs, then clears them", async () => {
    let resolvedDuringTurn: { path: string; mimeType: string } | undefined;
    let wrongCwdDuringTurn: { path: string; mimeType: string } | undefined;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async () => {
        const session = new FakeSession();
        session.onPrompt = async () => {
          // generate_image resolves a reference id against the running job's
          // workbench cwd (here, the project's main-workbench).
          resolvedDuringTurn = await service.resolveJobReference(
            "/tmp/project/main-workbench",
            "pic_1",
          );
          wrongCwdDuringTurn = await service.resolveJobReference("/somewhere/else", "pic_1");
        };
        return session;
      },
    });

    const proj: RuntimeProject = {
      ...project(),
      runtimeKey: "bot_job_1",
      references: [{ id: "pic_1", path: "/factory/ada/attachments/a.png", mimeType: "image/png" }],
    };
    await service.sendPrompt(proj, "draw a hero like the picture", () => {});

    // Resolvable mid-turn, scoped to this job's workbench...
    expect(resolvedDuringTurn).toEqual({
      path: "/factory/ada/attachments/a.png",
      mimeType: "image/png",
    });
    expect(wrongCwdDuringTurn).toBeUndefined();
    // ...and gone once the turn ends, so a later job can't read it.
    expect(
      await service.resolveJobReference("/tmp/project/main-workbench", "pic_1"),
    ).toBeUndefined();
  });

  it("routes picture saves to the turn's profile and resolves stored ids as references", async () => {
    const saved: Array<{ profileId: string; source: string }> = [];
    let storeResolvedDuringTurn: { path: string; mimeType: string } | undefined;
    const imageStore = {
      saveImage: async (profileId: string, input: { source: string }) => {
        saved.push({ profileId, source: input.source });
        return { id: "img_1", path: "attachments/img_1.png", mimeType: "image/png" };
      },
      resolveImageFile: async (profileId: string, id: string) =>
        profileId === "ada" && id === "stored_77"
          ? { path: "/factory/ada/conversation/attachments/stored_77.png", mimeType: "image/png" }
          : undefined,
    };
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      imageStore,
      createSession: async () => {
        const session = new FakeSession();
        session.onPrompt = async () => {
          // A stored id (no per-turn blueprint ref) resolves via the store.
          storeResolvedDuringTurn = await service.resolveJobReference(
            "/tmp/project/main-workbench",
            "stored_77",
          );
        };
        return session;
      },
    });

    // No blueprint references on this project: resolution must come from the store.
    await service.sendPrompt({ ...project(), runtimeKey: "bot_job_1" }, "draw something", () => {});

    expect(storeResolvedDuringTurn).toEqual({
      path: "/factory/ada/conversation/attachments/stored_77.png",
      mimeType: "image/png",
    });
    // Once the turn ends the cwd→profile mapping is gone, so saves/lookups no-op.
    expect(
      await service.resolveJobReference("/tmp/project/main-workbench", "stored_77"),
    ).toBeUndefined();
  });

  it("clears builder reference pictures when disposed during a running turn", async () => {
    const session = new FakeSession();
    session.blockPrompt = true;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createSession: async () => session,
    });
    const proj: RuntimeProject = {
      ...project(),
      runtimeKey: "bot_job_1",
      references: [{ id: "pic_1", path: "/factory/ada/attachments/a.png", mimeType: "image/png" }],
    };

    const run = service.sendPrompt(proj, "draw a hero like the picture", () => {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(await service.resolveJobReference("/tmp/project/main-workbench", "pic_1")).toEqual({
      path: "/factory/ada/attachments/a.png",
      mimeType: "image/png",
    });

    service.disposeAll();

    expect(
      await service.resolveJobReference("/tmp/project/main-workbench", "pic_1"),
    ).toBeUndefined();
    await session.abort();
    await run;
  });

  it("disposes a headless browser when bot session creation fails", async () => {
    let disposed = false;
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
      createBrowser: () =>
        ({
          dispose: () => {
            disposed = true;
          },
        }) as never,
      createSession: async () => {
        throw new Error("session failed");
      },
    });

    await expect(
      service.sendPrompt({ ...project(), runtimeKey: "bot_job_1" }, "Build", () => {}),
    ).rejects.toThrow("session failed");
    expect(disposed).toBe(true);
  });
});
