// Single source of truth for the tools Bit may use inside a kid session.
// Each harness translates this list into its own config format. If you add
// a tool here, also confirm the kid-session prompt actually needs it - the
// blast radius widens for every entry.

export const BIT_ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob"] as const;

export const BIT_DENIED_TOOLS = [
  "Bash",
  "BashOutput",
  "KillBash",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
  "NotebookEdit",
] as const;

export function renderClaudeSettings(): string {
  const settings = {
    permissions: {
      allow: [...BIT_ALLOWED_TOOLS],
      deny: [...BIT_DENIED_TOOLS],
    },
  };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function renderOpencodeConfig(): string {
  const config = {
    $schema: "https://opencode.ai/config.json",
    permission: {
      "*": "deny",
      read: "allow",
      edit: "allow",
      glob: "allow",
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
