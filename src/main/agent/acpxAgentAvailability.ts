import { constants } from "node:fs";
import { access as fsAccess } from "node:fs/promises";
import { delimiter, extname, isAbsolute, join } from "node:path";
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
  const launcher = resolveAcpAgentLauncher(agent);
  const found = await findExecutable(launcher.command, opts);
  if (found) return;
  throw new Error(
    `ACPX launches ${agent} with "${launcher.commandLine}", but "${launcher.command}" is not on PATH. Install Node/npm or launch Hi-Bit from a shell that can find it.`,
  );
}

function firstCommandToken(commandLine: string): string {
  const trimmed = commandLine.trim();
  if (!trimmed) return "";
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : "";
  if (!quote) return trimmed.split(/\s+/u)[0] ?? "";
  const end = trimmed.indexOf(quote, 1);
  return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
}

async function findExecutable(
  command: string,
  opts: AssertAcpAgentLauncherOptions,
): Promise<string | null> {
  if (!command) return null;
  const platform = opts.platform ?? process.platform;
  const access = opts.access ?? fsAccess;
  const candidates = commandCandidates(
    command,
    opts.pathValue ?? process.env.PATH ?? "",
    platform,
    opts.pathext,
  );
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch (err) {
      void err;
    }
  }
  return null;
}

function commandCandidates(
  command: string,
  pathValue: string,
  platform: NodeJS.Platform,
  pathext?: string,
): string[] {
  const names = executableNames(command, platform, pathext);
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) return names;
  return pathValue
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => names.map((name) => join(entry, name)));
}

function executableNames(command: string, platform: NodeJS.Platform, pathext?: string): string[] {
  if (platform !== "win32" || extname(command)) return [command];
  const extensions = (pathext ?? process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}
