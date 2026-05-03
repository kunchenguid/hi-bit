import type { AgentId } from "@shared/config";
import { createAgentRegistry } from "acpx/runtime";

export type AcpAgentLauncher = {
  commandLine: string;
  command: string;
};

type AssertAcpAgentLauncherOptions = {
  pathValue?: string;
  access?: (path: string, mode?: number) => Promise<void>;
  platform?: NodeJS.Platform;
  pathext?: string;
};

export function resolveAcpAgentLauncher(agent: AgentId): AcpAgentLauncher {
  const commandLine = createAgentRegistry().resolve(agent);
  return { commandLine, command: firstCommandToken(commandLine) };
}

export async function assertAcpAgentLauncherAvailable(
  agent: AgentId,
  opts: AssertAcpAgentLauncherOptions = {},
): Promise<void> {
  void opts;
  resolveAcpAgentLauncher(agent);
}

function firstCommandToken(commandLine: string): string {
  const trimmed = commandLine.trim();
  if (!trimmed) return "";
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
  if (!quote) return trimmed.split(/\s+/u)[0] ?? "";
  const end = trimmed.indexOf(quote, 1);
  return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
}
