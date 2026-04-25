import type { HarnessId } from "@shared/config";
import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import type { ProfilePaths } from "../storage/layout";
import { appendSessionLogEntry } from "../storage/sessionLog";
import { appendTranscriptEvent } from "../storage/transcript";
import { buildHarnessCommand, type HarnessInvocationMode } from "./command";
import {
  type HarnessRunEvent,
  type HarnessRunResult,
  type HarnessSpawnFn,
  runHarness,
} from "./run";

export type ExecuteHarnessTurnOptions = {
  paths: ProfilePaths;
  harness: HarnessId;
  binary: string;
  sessionId: string;
  mode: HarnessInvocationMode;
  prompt: string;
  agentPrompt?: string;
  role: SessionRole;
  cwd: string;
  spawn: HarnessSpawnFn;
  now?: () => number;
  onEvent?: (event: HarnessRunEvent) => void;
  signal?: AbortSignal;
};

export type HarnessTurnResult = {
  run: HarnessRunResult;
  durationMs: number;
  logEntry: HarnessInvocationLogEntry;
};

export async function executeHarnessTurn(
  opts: ExecuteHarnessTurnOptions,
): Promise<HarnessTurnResult> {
  const now = opts.now ?? Date.now;
  const startMs = now();
  const startedAt = new Date(startMs).toISOString();

  const userEvent: TranscriptEvent = {
    timestamp: startedAt,
    role: opts.role,
    sessionId: opts.sessionId,
    kind: "user_message",
    text: opts.prompt,
  };
  await appendTranscriptEvent(opts.paths, userEvent);

  const command = buildHarnessCommand({
    harness: opts.harness,
    binary: opts.binary,
    sessionId: opts.sessionId,
    prompt: opts.agentPrompt ?? opts.prompt,
    cwd: opts.cwd,
    mode: opts.mode,
  });

  let run: HarnessRunResult;
  try {
    run = await runHarness({
      command,
      spawn: opts.spawn,
      onEvent: opts.onEvent,
      signal: opts.signal,
    });
  } catch (err) {
    const endMs = now();
    await appendTranscriptEvent(opts.paths, {
      timestamp: new Date(endMs).toISOString(),
      role: opts.role,
      sessionId: opts.sessionId,
      kind: "error",
      text: err instanceof Error ? err.message : String(err),
    });
    await appendSessionLogEntry(opts.paths, {
      timestamp: startedAt,
      harness: opts.harness,
      role: opts.role,
      sessionId: opts.sessionId,
      mode: opts.mode,
      durationMs: endMs - startMs,
      exitCode: null,
      signal: null,
    });
    throw err;
  }

  const endMs = now();
  const endedAt = new Date(endMs).toISOString();
  const success = run.exitCode === 0 && run.signal === null;

  const outEvent: TranscriptEvent = success
    ? {
        timestamp: endedAt,
        role: opts.role,
        sessionId: opts.sessionId,
        kind: "assistant_message",
        text: run.stdout,
      }
    : {
        timestamp: endedAt,
        role: opts.role,
        sessionId: opts.sessionId,
        kind: "error",
        text:
          run.stderr ||
          `harness exited with code=${run.exitCode ?? "null"} signal=${run.signal ?? "null"}`,
      };
  await appendTranscriptEvent(opts.paths, outEvent);

  const logEntry: HarnessInvocationLogEntry = {
    timestamp: startedAt,
    harness: opts.harness,
    role: opts.role,
    sessionId: opts.sessionId,
    mode: opts.mode,
    durationMs: endMs - startMs,
    exitCode: run.exitCode,
    signal: run.signal,
  };
  await appendSessionLogEntry(opts.paths, logEntry);

  return { run, durationMs: endMs - startMs, logEntry };
}
