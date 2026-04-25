import type { HarnessInvocationLogEntry, SessionRole } from "@shared/sessionLog";

export type AuditRoleFilter = "all" | SessionRole;

export const AUDIT_ROLE_FILTERS: readonly AuditRoleFilter[] = ["all", "kid", "parent"] as const;

export const AUDIT_ROLE_FILTER_LABELS: Record<AuditRoleFilter, string> = {
  all: "all",
  kid: "kid",
  parent: "parent",
};

export function filterSessionsByRole(
  sessions: HarnessInvocationLogEntry[],
  filter: AuditRoleFilter,
): HarnessInvocationLogEntry[] {
  if (filter === "all") return sessions;
  return sessions.filter((s) => s.role === filter);
}

export function countAuditSessionsByRoleFilter(
  sessions: readonly HarnessInvocationLogEntry[],
): Record<AuditRoleFilter, number> {
  const all = new Set<string>();
  const kid = new Set<string>();
  const parent = new Set<string>();
  for (const s of sessions) {
    all.add(s.sessionId);
    if (s.role === "kid") kid.add(s.sessionId);
    else if (s.role === "parent") parent.add(s.sessionId);
  }
  return { all: all.size, kid: kid.size, parent: parent.size };
}
