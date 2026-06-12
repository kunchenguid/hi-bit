import {
  type BeforeProviderRequestEvent,
  createAgentSession,
  type ExtensionContext,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeProject } from "../projects/projectService";
import { PiRuntimeService } from "./piRuntimeService";

const piRuntime = vi.hoisted(() => {
  const agentSession = {
    sessionId: "real-bot-1",
    sessionFile: "/tmp/project/sessions/bots/real.jsonl",
    messages: [],
    subscribe: vi.fn(() => () => {}),
    prompt: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  const authStorage = { setRuntimeApiKey: vi.fn() };
  return { agentSession, authStorage };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    AuthStorage: { inMemory: vi.fn(() => piRuntime.authStorage) },
    ModelRegistry: {
      inMemory: vi.fn(() => ({
        find: vi.fn(() => ({ provider: "openai-codex", id: "gpt-5.5" })),
      })),
    },
    SessionManager: {
      create: vi.fn(() => ({ kind: "created" })),
      open: vi.fn(() => ({ kind: "opened" })),
    },
    SettingsManager: { inMemory: vi.fn(() => ({ kind: "settings" })) },
    createAgentSession: vi.fn(async () => ({ session: piRuntime.agentSession })),
  };
});

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

async function applyFastModeHook(loader: ResourceLoader) {
  const extension = loader.getExtensions().extensions[0];
  const [handler] = extension.handlers.get("before_provider_request") ?? [];
  return handler(
    {
      type: "before_provider_request",
      payload: { model: "gpt-5.5" },
    } satisfies BeforeProviderRequestEvent,
    { model: { provider: "openai-codex", id: "gpt-5.5" } } as ExtensionContext,
  );
}

describe("PiRuntimeService production session", () => {
  it("passes bot sessions a resource loader with Codex fast mode enabled", async () => {
    const service = new PiRuntimeService({
      agentDir: "/tmp/hibit/pi-agent",
      getFreshAccessToken: async () => "token",
    });

    await service.sendPrompt(project(), "Build", () => {});

    const options = vi.mocked(createAgentSession).mock.calls.at(-1)?.[0];
    await expect(applyFastModeHook(options?.resourceLoader as ResourceLoader)).resolves.toEqual({
      model: "gpt-5.5",
      service_tier: "priority",
    });
  });
});
