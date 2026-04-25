import type { SendMessageResult } from "@shared/chat";
import type { HarnessDetection, HarnessId, HiBitConfig } from "@shared/config";
import type { SessionRole } from "@shared/sessionLog";
import type { HiBitLayout, ProfilePaths } from "../storage/layout";
import { profilePathsFor } from "../storage/layout";
import { ensureProfileScaffold, readProfile } from "../storage/profiles";
import { readSessionLogEntries } from "../storage/sessionLog";
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
  signal?: AbortSignal;
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
    if (result.run.exitCode === 0 && result.run.signal === null) {
      return { ok: true, text: result.run.stdout, durationMs: result.durationMs };
    }
    const stderr = result.run.stderr.trim();
    return {
      ok: false,
      error:
        stderr ||
        `Agent exited with code=${result.run.exitCode ?? "null"} signal=${result.run.signal ?? "null"}`,
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
