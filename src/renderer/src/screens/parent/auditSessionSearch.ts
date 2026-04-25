import type { HarnessInvocationLogEntry } from "@shared/sessionLog";

export function normalizeAuditSessionSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchAuditSessionsByText(
  sessions: readonly HarnessInvocationLogEntry[],
  query: string,
): HarnessInvocationLogEntry[] {
  const normalized = normalizeAuditSessionSearchQuery(query);
  if (normalized.length === 0) return [...sessions];
  const tokens = normalized.split(" ");
  const matchingSessionIds = new Set<string>();
  for (const s of sessions) {
    const haystack = `${s.role} ${s.harness} ${s.sessionId} ${s.timestamp}`.toLowerCase();
    if (tokens.every((t) => haystack.includes(t))) {
      matchingSessionIds.add(s.sessionId);
    }
  }
  return sessions.filter((s) => matchingSessionIds.has(s.sessionId));
}
