import type { HarnessInvocationMode } from "./command";

export type BuildClaudeStreamArgsOptions = {
  sessionId: string;
  mode: HarnessInvocationMode;
};

const CLAUDE_ISOLATION_FLAGS = [
  "--setting-sources",
  "project",
  "--strict-mcp-config",
  "--disable-slash-commands",
];
const CLAUDE_EFFORT_FLAGS = ["--effort", "low"];
const CLAUDE_OUTPUT_FLAGS = [
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
];
const CLAUDE_INPUT_FLAGS = ["--input-format", "stream-json"];

export function buildClaudeStreamArgs(opts: BuildClaudeStreamArgsOptions): string[] {
  const session =
    opts.mode === "start" ? ["--session-id", opts.sessionId] : ["--resume", opts.sessionId];
  return [
    ...CLAUDE_ISOLATION_FLAGS,
    ...CLAUDE_EFFORT_FLAGS,
    ...CLAUDE_OUTPUT_FLAGS,
    ...CLAUDE_INPUT_FLAGS,
    "-p",
    "",
    ...session,
  ];
}
