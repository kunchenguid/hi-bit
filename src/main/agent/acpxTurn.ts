import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { AgentId } from "@shared/config";
import {
  type AcpRuntimeEvent,
  type AcpRuntimeOptions,
  type AcpRuntimeTurnResult,
  type AcpxRuntime,
  createAcpRuntime,
  createFileSessionStore,
} from "acpx/runtime";
import { createCleanAgentRegistry } from "./cleanAcpAgentConfig";

type AcpxRuntimeLike = Pick<AcpxRuntime, "ensureSession" | "startTurn" | "close"> &
  Partial<Pick<AcpxRuntime, "setConfigOption">>;
type AcpxRuntimeHandleLike = Awaited<ReturnType<AcpxRuntimeLike["ensureSession"]>>;
type RuntimeFactoryLike = (options: AcpRuntimeOptions) => AcpxRuntimeLike;
type SessionRoleLike = "kid" | "parent";
type WarmRuntimeEntry = {
  runtime: AcpxRuntimeLike;
  handle: AcpxRuntimeHandleLike;
  sessionKey: string;
};
type WarmRuntimeEntryRecord = {
  sessionKey: string;
  entry: Promise<WarmRuntimeEntry>;
};

const warmRuntimeEntries = new Map<string, WarmRuntimeEntryRecord>();

export type AcpTurnUsage = {
  contextTokensUsed: number;
  contextTokensSize?: number;
};

export type AcpTurnResult = {
  status: AcpRuntimeTurnResult["status"];
  text: string;
  usage: AcpTurnUsage | null;
  error?: string;
};

export type ExecuteAcpTurnOptions = {
  agent: AgentId;
  sessionKey: string;
  cwd: string;
  stateDir: string;
  prompt: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  discardPersistentState?: boolean;
  runtimeFactory?: RuntimeFactoryLike;
};

export type CloseAcpRuntimeSessionsOptions = {
  profileId: string;
  role: SessionRoleLike;
  sessionId: string;
  reason?: string;
};

function warmRuntimeKey(opts: ExecuteAcpTurnOptions): string {
  return JSON.stringify([opts.stateDir, opts.cwd, opts.agent, opts.sessionKey]);
}

async function removeLocalSessionRecord(stateDir: string, sessionId: string): Promise<void> {
  await rm(join(stateDir, "sessions", `${encodeURIComponent(sessionId)}.json`), { force: true });
}

function acpxAgentError(agent: AgentId, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`Failed to start ${agent} through ACPX: ${message}`, {
    cause: err,
  });
}

export async function executeAcpTurn(opts: ExecuteAcpTurnOptions): Promise<AcpTurnResult> {
  const runtimeFactory = opts.runtimeFactory ?? ((options) => createAcpRuntime(options));
  const entry = opts.discardPersistentState
    ? await createWarmRuntimeEntry(opts, runtimeFactory)
    : await getWarmRuntimeEntry(opts, runtimeFactory);
  const { runtime, handle } = entry;
  try {
    const turn = runtime.startTurn({
      handle,
      text: opts.prompt,
      mode: "prompt",
      requestId: randomUUID(),
      signal: opts.signal,
    });

    let text = "";
    let usage: AcpTurnUsage | null = null;

    for await (const event of turn.events as AsyncIterable<AcpRuntimeEvent>) {
      if (event.type === "text_delta") {
        if ((event.stream ?? "output") === "output") {
          text += event.text;
          opts.onDelta?.(event.text);
        }
        continue;
      }
      if (
        event.type === "status" &&
        event.tag === "usage_update" &&
        typeof event.used === "number"
      ) {
        usage = {
          contextTokensUsed: event.used,
          ...(typeof event.size === "number" ? { contextTokensSize: event.size } : {}),
        };
      }
    }

    const result = await turn.result;

    if (result.status === "failed") {
      return { status: result.status, text, usage, error: result.error.message };
    }
    return { status: result.status, text, usage };
  } finally {
    if (opts.discardPersistentState) {
      try {
        await runtime.close({
          handle,
          reason: "turn complete",
          discardPersistentState: true,
        });
      } catch (err) {
        if (opts.discardPersistentState) {
          try {
            await removeLocalSessionRecord(opts.stateDir, handle.acpxRecordId ?? handle.sessionKey);
          } catch (removeErr) {
            void removeErr;
          }
        }
        void err;
      }
    }
  }
}

export async function closeAcpRuntimeSessions(opts: CloseAcpRuntimeSessionsOptions): Promise<void> {
  const sessionKeyPrefix = `${opts.profileId}:${opts.role}:${opts.sessionId}:`;
  const closeReason = opts.reason ?? "Hi-Bit session ended";
  const matching = Array.from(warmRuntimeEntries.entries()).filter(([, record]) =>
    record.sessionKey.startsWith(sessionKeyPrefix),
  );

  await closeWarmRuntimeRecords(matching, closeReason);
}

export async function closeAllAcpRuntimes(reason = "Hi-Bit shutdown"): Promise<void> {
  await closeWarmRuntimeRecords(Array.from(warmRuntimeEntries.entries()), reason);
}

async function closeWarmRuntimeRecords(
  records: Array<[string, WarmRuntimeEntryRecord]>,
  reason: string,
): Promise<void> {
  await Promise.all(
    records.map(async ([key, record]) => {
      warmRuntimeEntries.delete(key);
      const entry = await record.entry;
      try {
        await entry.runtime.close({
          handle: entry.handle,
          reason,
          discardPersistentState: false,
        });
      } catch (err) {
        void err;
      }
    }),
  );
}

async function getWarmRuntimeEntry(
  opts: ExecuteAcpTurnOptions,
  runtimeFactory: RuntimeFactoryLike,
): Promise<WarmRuntimeEntry> {
  const key = warmRuntimeKey(opts);
  const existing = warmRuntimeEntries.get(key);
  if (existing) return existing.entry;
  const created = createWarmRuntimeEntry(opts, runtimeFactory);
  warmRuntimeEntries.set(key, { sessionKey: opts.sessionKey, entry: created });
  try {
    return await created;
  } catch (err) {
    warmRuntimeEntries.delete(key);
    throw err;
  }
}

async function createWarmRuntimeEntry(
  opts: ExecuteAcpTurnOptions,
  runtimeFactory: RuntimeFactoryLike,
): Promise<WarmRuntimeEntry> {
  let runtime: AcpxRuntimeLike;
  try {
    runtime = runtimeFactory({
      cwd: opts.cwd,
      sessionStore: createFileSessionStore({ stateDir: opts.stateDir }),
      agentRegistry: await createCleanAgentRegistry(opts.stateDir),
      permissionMode: "approve-all",
      nonInteractivePermissions: "deny",
    });
  } catch (err) {
    throw acpxAgentError(opts.agent, err);
  }

  let handle: AcpxRuntimeHandleLike;
  try {
    handle = await runtime.ensureSession({
      sessionKey: opts.sessionKey,
      agent: opts.agent,
      mode: "persistent",
      cwd: opts.cwd,
    });
  } catch (err) {
    throw acpxAgentError(opts.agent, err);
  }
  await applyLowEffortConfig(runtime, handle);
  return { runtime, handle, sessionKey: opts.sessionKey };
}

async function applyLowEffortConfig(
  runtime: AcpxRuntimeLike,
  handle: AcpxRuntimeHandleLike,
): Promise<void> {
  if (!runtime.setConfigOption) return;
  try {
    await runtime.setConfigOption({ handle, key: "effort", value: "low" });
  } catch (err) {
    void err;
  }
}
