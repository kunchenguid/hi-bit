import type { HarnessId } from "@shared/config";

export type HarnessInvocationMode = "start" | "resume";

export type BuildHarnessCommandOptions = {
  harness: HarnessId;
  binary: string;
  sessionId: string;
  prompt: string;
  cwd: string;
  mode: HarnessInvocationMode;
};

export type HarnessCommand = {
  bin: string;
  args: string[];
  cwd: string;
};

export function buildHarnessCommand(opts: BuildHarnessCommandOptions): HarnessCommand {
  const binary = opts.binary.trim();
  if (!binary) throw new Error("buildHarnessCommand: binary must be non-empty");
  const sessionId = opts.sessionId.trim();
  if (!sessionId) throw new Error("buildHarnessCommand: sessionId must be non-empty");
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("buildHarnessCommand: prompt must be non-empty");
  const cwd = opts.cwd.trim();
  if (!cwd) throw new Error("buildHarnessCommand: cwd must be non-empty");
  const args = argsFor(opts.harness, opts.mode, sessionId, opts.prompt);
  return { bin: binary, args, cwd };
}

const CLAUDE_ISOLATION_FLAGS = [
  "--setting-sources",
  "",
  "--strict-mcp-config",
  "--disable-slash-commands",
];

const CODEX_ISOLATION_FLAGS = ["--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"];

function argsFor(
  harness: HarnessId,
  mode: HarnessInvocationMode,
  sessionId: string,
  prompt: string,
): string[] {
  switch (harness) {
    case "claude":
      return mode === "start"
        ? [...CLAUDE_ISOLATION_FLAGS, "-p", prompt, "--session-id", sessionId]
        : [...CLAUDE_ISOLATION_FLAGS, "--resume", sessionId, "-p", prompt];
    case "codex":
      return mode === "start"
        ? ["exec", ...CODEX_ISOLATION_FLAGS, "--session-id", sessionId, prompt]
        : ["exec", "resume", ...CODEX_ISOLATION_FLAGS, sessionId, prompt];
    case "opencode":
      return ["run", "--pure", "--session", sessionId, prompt];
  }
}
