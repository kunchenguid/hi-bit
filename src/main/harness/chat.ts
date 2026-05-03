import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { CursorMarkerRequest, SendMessageResult } from "@shared/chat";
import type { AgentId, HiBitConfig } from "@shared/config";
import type { KnowledgePointStatus } from "@shared/progress";
import { collectRequiredKps, pickNextKP } from "@shared/scheduler";
import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";
import { type ExecuteAcpTurnOptions, executeAcpTurn } from "../agent/acpxTurn";
import { loadDreams } from "../graph/dreams";
import { loadKnowledgeGraph } from "../graph/load";
import type { HiBitLayout, ProfilePaths } from "../storage/layout";
import { profilePathsFor } from "../storage/layout";
import {
  ensureProfileScaffold,
  readProfile,
  readProgress,
  updateKpStatus,
} from "../storage/profiles";
import { listProjectFiles } from "../storage/projects";
import { appendSessionLogEntry, readSessionLogEntries } from "../storage/sessionLog";
import { appendTranscriptEvent } from "../storage/transcript";
import { buildCursorMarkerPrompt } from "./cursorMarkerPrompt";
import {
  createHiBitControlStreamFilter,
  extractHiBitControlBlocks,
  type HiBitControlBlock,
  stripHiBitControlBlocks,
} from "./hiBitControl";
import type {
  HarnessInvocationMode,
  LearningPlanContext,
  SessionMemoryContext,
} from "./sessionContext";
import { withSessionContext } from "./sessionContext";

export type SendMessageOptions = {
  layout: HiBitLayout;
  config: HiBitConfig;
  profileId: string;
  prompt: string;
  now?: () => number;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  runtimeFactory?: ExecuteAcpTurnOptions["runtimeFactory"];
};

export type SendKidMessageOptions = SendMessageOptions;
export type SendParentMessageOptions = SendMessageOptions;

export type RequestCursorMarkerOptions = Omit<SendMessageOptions, "prompt" | "onDelta"> & {
  request: CursorMarkerRequest;
};

export function sendKidMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  return sendMessage(opts, "kid");
}

export function sendParentMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  return sendMessage(opts, "parent");
}

export async function requestCursorMarker(
  opts: RequestCursorMarkerOptions,
): Promise<SendMessageResult> {
  const startMs = (opts.now ?? Date.now)();
  const profile = await readProfile(opts.layout, opts.profileId);
  if (!profile) {
    return { ok: false, error: `Profile not found: ${opts.profileId}`, durationMs: 0 };
  }

  const agent = opts.config.defaultAgent;
  if (!agent) {
    return { ok: false, error: "No default agent is configured", durationMs: 0 };
  }

  const paths = profilePathsFor(opts.layout, opts.profileId);
  await ensureProfileScaffold(opts.layout, paths, profile);
  const prompt = buildCursorMarkerPrompt(opts.request);

  try {
    const projectFiles = await projectFilesForCurrentDream(paths, profile);
    const agentPrompt = withSessionContext({
      userPrompt: prompt,
      role: "kid",
      profile,
      profileDir: paths.root,
      projectFiles,
      mode: "start",
    });

    const result = await executeAcpTurn({
      agent,
      sessionKey: sessionKeyFor(opts.profileId, "kid", randomUUID(), agent),
      cwd: paths.root,
      stateDir: paths.acpxSessionsDir,
      prompt: agentPrompt,
      signal: opts.signal,
      runtimeFactory: opts.runtimeFactory,
    });
    const durationMs = (opts.now ?? Date.now)() - startMs;
    if (result.status === "completed") {
      return { ok: true, text: result.text, durationMs };
    }
    return {
      ok: false,
      error: result.error || "Agent failed",
      durationMs,
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

async function sendMessage(
  opts: SendMessageOptions,
  role: SessionRole,
): Promise<SendMessageResult> {
  const now = opts.now ?? Date.now;
  const startMs = now();
  const prompt = opts.prompt.trim();
  if (prompt.length === 0) {
    return { ok: false, error: "Prompt must not be empty", durationMs: 0 };
  }

  const profile = await readProfile(opts.layout, opts.profileId);
  if (!profile) {
    return { ok: false, error: `Profile not found: ${opts.profileId}`, durationMs: 0 };
  }

  const agent = opts.config.defaultAgent;
  if (!agent) {
    return { ok: false, error: "No default agent is configured", durationMs: 0 };
  }

  const paths = profilePathsFor(opts.layout, opts.profileId);
  await ensureProfileScaffold(opts.layout, paths, profile);
  const sessionId = role === "kid" ? profile.sessions.kid : profile.sessions.parent;
  const startedAt = new Date(startMs).toISOString();
  let mode: HarnessInvocationMode = "start";

  try {
    mode = await resolveMode(paths, sessionId);
    const injectSessionContext = shouldInjectSessionContext(role, profile, mode);
    const projectFiles =
      role === "kid" && injectSessionContext
        ? await projectFilesForCurrentDream(paths, profile)
        : undefined;
    const memory = injectSessionContext ? await readSessionMemory(paths) : undefined;
    const learningPlan =
      role === "kid" && injectSessionContext
        ? await learningPlanForCurrentDream(opts.layout, opts.profileId, profile)
        : undefined;
    const agentPrompt = withSessionContext({
      userPrompt: prompt,
      role,
      profile,
      profileDir: paths.root,
      projectFiles,
      memory,
      learningPlan,
      mode: injectSessionContext ? "start" : mode,
    });

    await appendTranscriptEvent(paths, {
      timestamp: startedAt,
      role,
      sessionId,
      kind: "user_message",
      text: prompt,
    });

    const streamFilter = opts.onDelta ? createHiBitControlStreamFilter(opts.onDelta) : null;
    const result = await executeAcpTurn({
      agent,
      sessionKey: sessionKeyFor(opts.profileId, role, sessionId, agent),
      cwd: paths.root,
      stateDir: paths.acpxSessionsDir,
      prompt: agentPrompt,
      signal: opts.signal,
      runtimeFactory: opts.runtimeFactory,
      onDelta: (text) => streamFilter?.push(text),
    });
    streamFilter?.finish();

    const endMs = now();
    const endedAt = new Date(endMs).toISOString();
    const durationMs = endMs - startMs;
    const controlBlocks = extractHiBitControlBlocks(result.text);
    const visibleText = stripHiBitControlBlocks(result.text);

    await appendSessionLogEntry(
      paths,
      buildInvocationLogEntry({
        timestamp: startedAt,
        agent,
        role,
        sessionId,
        mode,
        durationMs,
        success: result.status === "completed",
        usage: result.usage,
      }),
    );

    if (result.status === "completed") {
      await applyProgressControlBlocks(opts.layout, opts.profileId, controlBlocks);
      await appendTranscriptEvent(paths, {
        timestamp: endedAt,
        role,
        sessionId,
        kind: "assistant_message",
        text: visibleText,
      });
      return { ok: true, text: visibleText, durationMs };
    }

    const error = result.error || "Agent failed";
    await appendTranscriptEvent(paths, {
      timestamp: endedAt,
      role,
      sessionId,
      kind: "error",
      text: error,
    });
    return { ok: false, error, durationMs };
  } catch (err) {
    const endMs = now();
    const message = err instanceof Error ? err.message : String(err);
    await appendTranscriptEvent(paths, {
      timestamp: new Date(endMs).toISOString(),
      role,
      sessionId,
      kind: "error",
      text: message,
    });
    await appendSessionLogEntry(paths, {
      timestamp: startedAt,
      harness: agent,
      role,
      sessionId,
      mode,
      durationMs: endMs - startMs,
      exitCode: null,
      signal: null,
    });
    return { ok: false, error: message, durationMs: endMs - startMs };
  }
}

function buildInvocationLogEntry(opts: {
  timestamp: string;
  agent: AgentId;
  role: SessionRole;
  sessionId: string;
  mode: HarnessInvocationMode;
  durationMs: number;
  success: boolean;
  usage: Awaited<ReturnType<typeof executeAcpTurn>>["usage"];
}): HarnessInvocationLogEntry {
  return {
    timestamp: opts.timestamp,
    harness: opts.agent,
    role: opts.role,
    sessionId: opts.sessionId,
    mode: opts.mode,
    durationMs: opts.durationMs,
    exitCode: opts.success ? 0 : null,
    signal: null,
    ...(opts.usage
      ? {
          tokensInput: opts.usage.inputTokens,
          tokensOutput: opts.usage.outputTokens,
        }
      : {}),
  };
}

function sessionKeyFor(
  profileId: string,
  role: SessionRole,
  sessionId: string,
  agent: AgentId,
): string {
  return `${profileId}:${role}:${sessionId}:${agent}`;
}

async function resolveMode(paths: ProfilePaths, sessionId: string): Promise<HarnessInvocationMode> {
  const entries = await readSessionLogEntries(paths);
  const hasPriorSuccess = entries.some(
    (e) => e.sessionId === sessionId && e.exitCode === 0 && e.signal === null,
  );
  return hasPriorSuccess ? "resume" : "start";
}

function shouldInjectSessionContext(
  role: SessionRole,
  profile: Parameters<typeof withSessionContext>[0]["profile"],
  mode: HarnessInvocationMode,
): boolean {
  void role;
  void profile;
  return mode === "start";
}

async function readSessionMemory(paths: ProfilePaths): Promise<SessionMemoryContext> {
  const [stateMd, progressJson] = await Promise.all([
    readFile(paths.stateFile, "utf8"),
    readFile(paths.progressFile, "utf8"),
  ]);
  return { stateMd, progressJson };
}

async function projectFilesForCurrentDream(
  paths: ProfilePaths,
  profile: Parameters<typeof withSessionContext>[0]["profile"],
): Promise<string[] | undefined> {
  if (!profile.currentDreamId) return undefined;
  return listProjectFiles(paths, profile.currentDreamId);
}

async function learningPlanForCurrentDream(
  layout: HiBitLayout,
  profileId: string,
  profile: Parameters<typeof withSessionContext>[0]["profile"],
): Promise<LearningPlanContext | undefined> {
  if (!profile.currentDreamId) return undefined;
  const graphResult = await loadKnowledgeGraph(layout.graphNodesDir);
  if (!graphResult.ok) return undefined;
  const graph = graphResult.graph;
  const dreamResult = await loadDreams(layout.graphDreamsDir, graph);
  if (!dreamResult.ok) return undefined;
  const dream = dreamResult.library.byId[profile.currentDreamId];
  if (!dream) return undefined;

  const progress = await readProgress(layout, profileId);
  const nextUpKpId = pickNextKP(graph, dream, progress);
  const { ordered } = collectRequiredKps(graph, dream);
  const requiredKps = ordered
    .map((id) => graph.byId[id])
    .filter((kp) => kp !== undefined)
    .map((kp) => ({
      id: kp.id,
      titleKid: kp.title_kid,
      ...(kp.why_kid ? { whyKid: kp.why_kid } : {}),
      status: progress.knowledgePoints[kp.id]?.status ?? null,
      masterySignals: kp.mastery_signals,
    }));

  return {
    dream: { id: dream.id, titleKid: dream.title_kid },
    nextUpKpId,
    requiredKps,
  };
}

type ProgressControlEntry = {
  kpId?: unknown;
  status?: unknown;
  evidence?: unknown;
};

const VALID_KP_STATUSES = new Set<KnowledgePointStatus>([
  "saw_it",
  "did_with_help",
  "did_unprompted",
  "explained_it",
]);

const KP_STATUS_RANK: Record<KnowledgePointStatus, number> = {
  saw_it: 1,
  did_with_help: 2,
  did_unprompted: 3,
  explained_it: 4,
};

async function applyProgressControlBlocks(
  layout: HiBitLayout,
  profileId: string,
  blocks: readonly HiBitControlBlock[],
): Promise<void> {
  const progressBlocks = blocks.filter((block) => block.name === "progress");
  if (progressBlocks.length === 0) return;

  const graphResult = await loadKnowledgeGraph(layout.graphNodesDir);
  if (!graphResult.ok) return;
  const validKpIds = new Set(Object.keys(graphResult.graph.byId));
  const progress = await readProgress(layout, profileId);
  const currentStatuses = new Map(
    Object.entries(progress.knowledgePoints).map(([kpId, kp]) => [kpId, kp.status]),
  );

  for (const block of progressBlocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.body);
    } catch {
      continue;
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      const candidate = entry as ProgressControlEntry;
      if (typeof candidate.kpId !== "string") continue;
      if (!validKpIds.has(candidate.kpId)) continue;
      if (typeof candidate.status !== "string") continue;
      if (!VALID_KP_STATUSES.has(candidate.status as KnowledgePointStatus)) continue;
      const nextStatus = candidate.status as KnowledgePointStatus;
      if (progress.knowledgePoints[candidate.kpId]?.skipped) continue;
      const currentStatus = currentStatuses.get(candidate.kpId);
      if (currentStatus && KP_STATUS_RANK[currentStatus] >= KP_STATUS_RANK[nextStatus]) continue;
      await updateKpStatus(layout, profileId, candidate.kpId, nextStatus, {
        evidence: typeof candidate.evidence === "string" ? candidate.evidence : undefined,
      });
      currentStatuses.set(candidate.kpId, nextStatus);
    }
  }
}
