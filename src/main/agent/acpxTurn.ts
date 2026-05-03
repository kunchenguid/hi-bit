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
  createAgentRegistry,
  createFileSessionStore,
} from "acpx/runtime";

type AcpxRuntimeLike = Pick<AcpxRuntime, "ensureSession" | "startTurn" | "close">;
type AcpxRuntimeHandleLike = Awaited<ReturnType<AcpxRuntimeLike["ensureSession"]>>;

export type AcpTurnUsage = {
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
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
  runtimeFactory?: (options: AcpRuntimeOptions) => AcpxRuntimeLike;
};

function estimateTokens(chars: number): number {
  return chars <= 0 ? 0 : Math.ceil(chars / 4);
}

async function removeLocalSessionRecord(stateDir: string, sessionId: string): Promise<void> {
  await rm(join(stateDir, "sessions", `${encodeURIComponent(sessionId)}.json`), { force: true });
}

export async function executeAcpTurn(opts: ExecuteAcpTurnOptions): Promise<AcpTurnResult> {
  const runtimeFactory = opts.runtimeFactory ?? ((options) => createAcpRuntime(options));
  const runtime = runtimeFactory({
    cwd: opts.cwd,
    sessionStore: createFileSessionStore({ stateDir: opts.stateDir }),
    agentRegistry: createAgentRegistry(),
    permissionMode: "approve-all",
    nonInteractivePermissions: "deny",
  });

  let handle: AcpxRuntimeHandleLike | undefined;
  try {
    handle = await runtime.ensureSession({
      sessionKey: opts.sessionKey,
      agent: opts.agent,
      mode: "persistent",
      cwd: opts.cwd,
    });
    const turn = runtime.startTurn({
      handle,
      text: opts.prompt,
      mode: "prompt",
      requestId: randomUUID(),
      signal: opts.signal,
    });

    let text = "";
    let outputChars = 0;
    let latestUsed: number | null = null;

    for await (const event of turn.events as AsyncIterable<AcpRuntimeEvent>) {
      if (event.type === "text_delta") {
        if ((event.stream ?? "output") === "output") {
          text += event.text;
          opts.onDelta?.(event.text);
        }
        outputChars += event.text.length;
        continue;
      }
      if (event.type === "status" && typeof event.used === "number") {
        latestUsed = event.used;
      }
    }

    const result = await turn.result;
    const usage =
      latestUsed === null
        ? null
        : {
            inputTokens: latestUsed,
            outputTokens: estimateTokens(outputChars),
            estimated: false,
          };

    if (result.status === "failed") {
      return { status: result.status, text, usage, error: result.error.message };
    }
    return { status: result.status, text, usage };
  } finally {
    if (handle) {
      try {
        await runtime.close({
          handle,
          reason: "turn complete",
          discardPersistentState: opts.discardPersistentState ?? false,
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
