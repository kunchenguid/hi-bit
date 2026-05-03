import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentId } from "@shared/config";
import { AGENT_IDS } from "@shared/config";
import { type AcpAgentRegistry, createAgentRegistry } from "acpx/runtime";

type CleanLaunchSpec = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

const CLAUDE_ACP_PACKAGE = "@agentclientprotocol/claude-agent-acp@^0.31.0";
const CODEX_ACP_PACKAGE = "@zed-industries/codex-acp@^0.12.0";

const LAUNCHER_SCRIPT = `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");

const specPath = process.argv[2];
if (!specPath) {
  console.error("clean ACP launcher requires a launch spec path");
  process.exit(1);
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const child = spawn(spec.command, spec.args || [], {
  stdio: "inherit",
  env: { ...process.env, ...(spec.env || {}) },
  shell: process.platform === "win32",
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (child.pid) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
`;

const CLAUDE_CODE_WRAPPER_SCRIPT = `#!/usr/bin/env node
const { spawn } = require("node:child_process");

const command = process.env.HIBIT_REAL_CLAUDE_CODE_EXECUTABLE || "claude";
const args = [
  "--setting-sources",
  "project,local",
  "--strict-mcp-config",
  "--disable-slash-commands",
  ...process.argv.slice(2),
];

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (child.pid) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
`;

export async function createCleanAgentRegistry(stateDir: string): Promise<AcpAgentRegistry> {
  const launchDir = join(stateDir, "clean-agent-launch");
  const configDir = join(stateDir, "clean-agent-config");
  const launcherPath = join(launchDir, "clean-acp-agent-launcher.cjs");
  const launcherWrapperPath = join(
    launchDir,
    process.platform === "win32" ? "clean-acp-agent-launcher.cmd" : "clean-acp-agent-launcher",
  );
  const claudeCodeWrapperPath = join(launchDir, "clean-claude-code.cjs");
  await mkdir(launchDir, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(launcherPath, LAUNCHER_SCRIPT, "utf8");
  await writeFile(launcherWrapperPath, cleanLauncherWrapperScript(launcherPath), "utf8");
  await writeFile(claudeCodeWrapperPath, CLAUDE_CODE_WRAPPER_SCRIPT, "utf8");
  await Promise.all([
    chmod(launcherPath, 0o755),
    chmod(launcherWrapperPath, 0o755),
    chmod(claudeCodeWrapperPath, 0o755),
  ]);

  const specs = cleanLaunchSpecs(configDir, claudeCodeWrapperPath);
  await Promise.all(
    AGENT_IDS.map(async (agent) => {
      const specPath = cleanLaunchSpecPath(launchDir, agent);
      await writeFile(specPath, `${JSON.stringify(specs[agent], null, 2)}\n`, "utf8");
    }),
  );

  return createAgentRegistry({
    overrides: Object.fromEntries(
      AGENT_IDS.map((agent) => [
        agent,
        cleanLauncherCommand(launcherWrapperPath, cleanLaunchSpecPath(launchDir, agent)),
      ]),
    ),
  });
}

function cleanLauncherCommand(launcherWrapperPath: string, specPath: string): string {
  return [launcherWrapperPath, specPath].map(quoteCommandPart).join(" ");
}

function cleanLauncherWrapperScript(launcherPath: string): string {
  if (process.platform === "win32") {
    return [
      "@echo off",
      "set ELECTRON_RUN_AS_NODE=1",
      `${quoteCommandPart(process.execPath)} ${quoteCommandPart(launcherPath)} %*`,
      "",
    ].join("\r\n");
  }
  return `#!/bin/sh
ELECTRON_RUN_AS_NODE=1
export ELECTRON_RUN_AS_NODE
exec ${quoteShellPart(process.execPath)} ${quoteShellPart(launcherPath)} "$@"
`;
}

function cleanLaunchSpecPath(launchDir: string, agent: AgentId): string {
  return join(launchDir, `${agent}.json`);
}

function cleanLaunchSpecs(
  configDir: string,
  claudeCodeWrapperPath: string,
): Record<AgentId, CleanLaunchSpec> {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  return {
    claude: {
      command: npx,
      args: ["-y", CLAUDE_ACP_PACKAGE],
      env: {
        CLAUDE_CODE_EXECUTABLE: claudeCodeWrapperPath,
        HIBIT_REAL_CLAUDE_CODE_EXECUTABLE: process.env.CLAUDE_CODE_EXECUTABLE ?? "claude",
      },
    },
    codex: {
      command: npx,
      args: ["-y", CODEX_ACP_PACKAGE, "-c", "ignore_user_config=true"],
    },
    opencode: {
      command: npx,
      args: ["-y", "opencode-ai", "acp", "--pure"],
      env: {
        XDG_CONFIG_HOME: join(configDir, "xdg-config"),
      },
    },
  };
}

function quoteCommandPart(value: string): string {
  return JSON.stringify(value);
}

function quoteShellPart(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
