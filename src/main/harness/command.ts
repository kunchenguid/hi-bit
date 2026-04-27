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
  "project",
  "--strict-mcp-config",
  "--disable-slash-commands",
];

// `--sandbox workspace-write` keeps codex's filesystem reach inside cwd
// (the kid's profile dir) and blocks network/shell escapes. `--full-auto`
// pairs that sandbox with auto-approval so the streaming session never
// stalls waiting for an interactive prompt.
const CODEX_ISOLATION_FLAGS = [
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox",
  "workspace-write",
  "--full-auto",
];
const CODEX_RESUME_FLAGS = ["--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"];

const CLAUDE_EFFORT_FLAGS = ["--effort", "low"];
const CLAUDE_OUTPUT_FLAGS = ["--output-format", "stream-json", "--verbose"];
const CODEX_EFFORT_FLAGS = ["-c", 'model_reasoning_effort="low"'];

function argsFor(
  harness: HarnessId,
  mode: HarnessInvocationMode,
  sessionId: string,
  prompt: string,
): string[] {
  switch (harness) {
    case "claude":
      return mode === "start"
        ? [
            ...CLAUDE_ISOLATION_FLAGS,
            ...CLAUDE_EFFORT_FLAGS,
            ...CLAUDE_OUTPUT_FLAGS,
            "-p",
            prompt,
            "--session-id",
            sessionId,
          ]
        : [
            ...CLAUDE_ISOLATION_FLAGS,
            ...CLAUDE_EFFORT_FLAGS,
            ...CLAUDE_OUTPUT_FLAGS,
            "--resume",
            sessionId,
            "-p",
            prompt,
          ];
    case "codex":
      return mode === "start"
        ? [
            "exec",
            ...CODEX_ISOLATION_FLAGS,
            ...CODEX_EFFORT_FLAGS,
            "--session-id",
            sessionId,
            prompt,
          ]
        : ["exec", "resume", ...CODEX_RESUME_FLAGS, ...CODEX_EFFORT_FLAGS, sessionId, prompt];
    case "opencode":
      return ["run", "--pure", "--session", sessionId, prompt];
  }
}
