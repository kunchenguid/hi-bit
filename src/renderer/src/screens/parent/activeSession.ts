import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";

export const DEFAULT_ACTIVE_SESSION_IDLE_GAP_MS = 30 * 60 * 1000;

export type ActiveSessionStatus = "under" | "near" | "over";

export type ActiveSessionInfo = {
  role: SessionRole;
  startedAt: string;
  lastAt: string;
  turnCount: number;
  elapsedMs: number;
  elapsedMinutes: number;
  status: ActiveSessionStatus;
};

export type BuildActiveSessionsPanelInput = {
  entries: readonly HarnessInvocationLogEntry[];
  targetMinutes: number;
  nowMs: number;
  idleGapMs?: number;
};

export type ActiveSessionsPanel = {
  kid: ActiveSessionInfo | null;
  parent: ActiveSessionInfo | null;
};

export function computeActiveSessionStatus(
  elapsedMinutes: number,
  targetMinutes: number,
): ActiveSessionStatus {
  if (targetMinutes <= 0) return "under";
  if (elapsedMinutes >= targetMinutes) return "over";
  if (elapsedMinutes >= Math.floor(targetMinutes * 0.8)) return "near";
  return "under";
}

function computeActiveSessionForRole(
  entries: readonly HarnessInvocationLogEntry[],
  role: SessionRole,
  nowMs: number,
  idleGapMs: number,
  targetMinutes: number,
): ActiveSessionInfo | null {
  const matching = entries
    .filter((e) => e.role === role)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (matching.length === 0) return null;
  const lastEntry = matching[matching.length - 1];
  if (!lastEntry) return null;
  const lastTime = Date.parse(lastEntry.timestamp);
  if (!Number.isFinite(lastTime)) return null;
  if (nowMs - lastTime > idleGapMs) return null;

  let startIdx = matching.length - 1;
  while (startIdx > 0) {
    const curr = matching[startIdx];
    const prev = matching[startIdx - 1];
    if (!curr || !prev) break;
    const currTime = Date.parse(curr.timestamp);
    const prevTime = Date.parse(prev.timestamp);
    if (!Number.isFinite(currTime) || !Number.isFinite(prevTime)) break;
    if (currTime - prevTime > idleGapMs) break;
    startIdx -= 1;
  }
  const firstEntry = matching[startIdx];
  if (!firstEntry) return null;
  const startedAtMs = Date.parse(firstEntry.timestamp);
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  return {
    role,
    startedAt: firstEntry.timestamp,
    lastAt: lastEntry.timestamp,
    turnCount: matching.length - startIdx,
    elapsedMs,
    elapsedMinutes,
    status: computeActiveSessionStatus(elapsedMinutes, targetMinutes),
  };
}

export function buildActiveSessionsPanel(
  input: BuildActiveSessionsPanelInput,
): ActiveSessionsPanel {
  const idleGapMs = input.idleGapMs ?? DEFAULT_ACTIVE_SESSION_IDLE_GAP_MS;
  return {
    kid: computeActiveSessionForRole(
      input.entries,
      "kid",
      input.nowMs,
      idleGapMs,
      input.targetMinutes,
    ),
    parent: computeActiveSessionForRole(
      input.entries,
      "parent",
      input.nowMs,
      idleGapMs,
      input.targetMinutes,
    ),
  };
}
