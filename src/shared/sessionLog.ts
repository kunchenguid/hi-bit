import type { HarnessId } from "./config";

export type SessionRole = "kid" | "parent";

export type HarnessInvocationLogEntry = {
  timestamp: string;
  harness: HarnessId;
  role: SessionRole;
  sessionId: string;
  mode: "start" | "resume";
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
  tokensInput?: number;
  tokensOutput?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};
