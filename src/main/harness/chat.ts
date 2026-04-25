import type { SendMessageResult } from "@shared/chat";
import type { HarnessDetection, HarnessId, HiBitConfig } from "@shared/config";
import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";
import type { HiBitLayout, ProfilePaths } from "../storage/layout";
import { profilePathsFor } from "../storage/layout";
import { ensureProfileScaffold, readProfile } from "../storage/profiles";
import { appendSessionLogEntry, readSessionLogEntries } from "../storage/sessionLog";
import { appendTranscriptEvent } from "../storage/transcript";
import { ClaudeSession, type ClaudeSessionSpawnFn, type ClaudeTurnEvent } from "./claudeSession";
import { ClaudeSessionRegistry } from "./claudeSessionRegistry";
import { buildClaudeStreamArgs } from "./claudeStreamArgs";
import type { HarnessInvocationMode } from "./command";
import type { HarnessRunEvent, HarnessSpawnFn } from "./run";
import { withSessionContext } from "./sessionContext";
import { executeHarnessTurn } from "./turn";

export type SendMessageOptions = {
  layout: HiBitLayout;
  config: HiBitConfig;
  detection: HarnessDetection;
  profileId: string;
  prompt: string;
  spawn: HarnessSpawnFn;
  now?: () => number;
  onEvent?: (event: HarnessRunEvent) => void;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  claudeRegistry?: ClaudeSessionRegistry<ClaudeSession>;
};

export type SendKidMessageOptions = SendMessageOptions;
export type SendParentMessageOptions = SendMessageOptions;

export function sendKidMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  return sendMessage(opts, "kid");
}

export function sendParentMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  return sendMessage(opts, "parent");
}

async function sendMessage(
  opts: SendMessageOptions,
  role: SessionRole,
): Promise<SendMessageResult> {
  const startMs = (opts.now ?? Date.now)();
  const prompt = opts.prompt.trim();
  if (prompt.length === 0) {
    return { ok: false, error: "Prompt must not be empty", durationMs: 0 };
  }

  const profile = await readProfile(opts.layout, opts.profileId);
  if (!profile) {
    return { ok: false, error: `Profile not found: ${opts.profileId}`, durationMs: 0 };
  }

  const harnessId = opts.config.defaultHarness;
  if (!harnessId) {
    return { ok: false, error: "No default agent is configured", durationMs: 0 };
  }

  const binary = resolveBinary(harnessId, opts.config, opts.detection);
  if (!binary) {
    return {
      ok: false,
      error: `No binary found for default agent: ${harnessId}`,
      durationMs: 0,
    };
  }

  const paths = profilePathsFor(opts.layout, opts.profileId);
  await ensureProfileScaffold(opts.layout, paths, profile);
  const sessionId = role === "kid" ? profile.sessions.kid : profile.sessions.parent;

  if (harnessId === "claude" && opts.claudeRegistry) {
    return sendClaudeStreaming({
      registry: opts.claudeRegistry,
      paths,
      profileId: opts.profileId,
      profile,
      role,
      sessionId,
      binary,
      prompt,
      spawn: opts.spawn,
      onDelta: opts.onDelta,
      now: opts.now,
      signal: opts.signal,
      startMs,
    });
  }

  const mode = await resolveMode(paths, sessionId);
  const agentPrompt = withSessionContext({
    userPrompt: prompt,
    role,
    profile,
    profileDir: paths.root,
    mode,
  });

  try {
    const result = await executeHarnessTurn({
      paths,
      harness: harnessId,
      binary,
      sessionId,
      mode,
      prompt,
      agentPrompt,
      role,
      cwd: paths.root,
      spawn: opts.spawn,
      now: opts.now,
      onEvent: opts.onEvent,
      signal: opts.signal,
    });
    const exitedCleanly = result.run.exitCode === 0 && result.run.signal === null;
    if (exitedCleanly && result.errorMessage === null) {
      return { ok: true, text: result.text, durationMs: result.durationMs };
    }
    const stderr = result.run.stderr.trim();
    const exitMessage = exitedCleanly
      ? null
      : `Agent exited with code=${result.run.exitCode ?? "null"} signal=${result.run.signal ?? "null"}`;
    return {
      ok: false,
      error: stderr || exitMessage || result.errorMessage || "Agent failed",
      durationMs: result.durationMs,
    };
  } catch (err) {
    const endMs = (opts.now ?? Date.now)();
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: endMs - startMs,
    };
  }
}

type SendClaudeStreamingOptions = {
  registry: ClaudeSessionRegistry<ClaudeSession>;
  paths: ProfilePaths;
  profileId: string;
  profile: Parameters<typeof withSessionContext>[0]["profile"];
  role: SessionRole;
  sessionId: string;
  binary: string;
  prompt: string;
  spawn: HarnessSpawnFn;
  onDelta?: (text: string) => void;
  now?: () => number;
  signal?: AbortSignal;
  startMs: number;
};

async function sendClaudeStreaming(opts: SendClaudeStreamingOptions): Promise<SendMessageResult> {
  const now = opts.now ?? Date.now;
  const startedAt = new Date(opts.startMs).toISOString();

  await appendTranscriptEvent(opts.paths, {
    timestamp: startedAt,
    role: opts.role,
    sessionId: opts.sessionId,
    kind: "user_message",
    text: opts.prompt,
  });

  const key = ClaudeSessionRegistry.makeKey(opts.profileId, opts.role);
  const isProcessFresh = !opts.registry.has(key);
  const mode: HarnessInvocationMode = isProcessFresh
    ? await resolveMode(opts.paths, opts.sessionId)
    : "resume";
  const session = opts.registry.getOrCreate(
    key,
    () =>
      new ClaudeSession({
        binary: opts.binary,
        args: buildClaudeStreamArgs({ sessionId: opts.sessionId, mode }),
        cwd: opts.paths.root,
        sessionId: opts.sessionId,
        spawn: opts.spawn as unknown as ClaudeSessionSpawnFn,
      }),
  );

  const messageText =
    isProcessFresh && mode === "start"
      ? withSessionContext({
          userPrompt: opts.prompt,
          role: opts.role,
          profile: opts.profile,
          profileDir: opts.paths.root,
          mode: "start",
        })
      : opts.prompt;

  const turn = session.sendMessage(messageText);

  const onAbort = () => session.close();
  if (opts.signal) {
    if (opts.signal.aborted) session.close();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  const drain = async () => {
    for await (const ev of turn.events as AsyncIterable<ClaudeTurnEvent>) {
      if (ev.kind === "delta" && opts.onDelta) opts.onDelta(ev.text);
    }
  };

  try {
    const [_drained, result] = await Promise.all([drain(), turn.complete]);
    const endMs = now();
    const endedAt = new Date(endMs).toISOString();

    await appendTranscriptEvent(opts.paths, {
      timestamp: endedAt,
      role: opts.role,
      sessionId: opts.sessionId,
      kind: "assistant_message",
      text: result.text,
    });

    const logEntry: HarnessInvocationLogEntry = {
      timestamp: startedAt,
      harness: "claude",
      role: opts.role,
      sessionId: opts.sessionId,
      mode,
      durationMs: endMs - opts.startMs,
      exitCode: 0,
      signal: null,
      ...(result.usage
        ? {
            tokensInput: result.usage.inputTokens,
            tokensOutput: result.usage.outputTokens,
            cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
            cacheReadInputTokens: result.usage.cacheReadInputTokens,
          }
        : {}),
    };
    await appendSessionLogEntry(opts.paths, logEntry);

    opts.signal?.removeEventListener("abort", onAbort);
    return { ok: true, text: result.text, durationMs: endMs - opts.startMs };
  } catch (err) {
    opts.signal?.removeEventListener("abort", onAbort);
    const endMs = now();
    const message = err instanceof Error ? err.message : String(err);
    await appendTranscriptEvent(opts.paths, {
      timestamp: new Date(endMs).toISOString(),
      role: opts.role,
      sessionId: opts.sessionId,
      kind: "error",
      text: message,
    });
    await appendSessionLogEntry(opts.paths, {
      timestamp: startedAt,
      harness: "claude",
      role: opts.role,
      sessionId: opts.sessionId,
      mode,
      durationMs: endMs - opts.startMs,
      exitCode: null,
      signal: null,
    });
    return { ok: false, error: message, durationMs: endMs - opts.startMs };
  }
}

function resolveBinary(
  harness: HarnessId,
  config: HiBitConfig,
  detection: HarnessDetection,
): string | null {
  const configured = config.harness[harness]?.trim();
  if (configured) return configured;
  const detected = detection[harness];
  return detected ?? null;
}

async function resolveMode(paths: ProfilePaths, sessionId: string): Promise<HarnessInvocationMode> {
  const entries = await readSessionLogEntries(paths);
  const hasPriorSuccess = entries.some(
    (e) => e.sessionId === sessionId && e.exitCode === 0 && e.signal === null,
  );
  return hasPriorSuccess ? "resume" : "start";
}
