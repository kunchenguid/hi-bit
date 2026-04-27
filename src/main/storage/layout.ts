import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type HiBitLayout = {
  root: string;
  configFile: string;
  promptsDir: string;
  graphDir: string;
  graphNodesDir: string;
  graphDreamsDir: string;
  profilesDir: string;
};

export function layoutFor(root: string): HiBitLayout {
  return {
    root,
    configFile: join(root, "config.json"),
    promptsDir: join(root, "prompts"),
    graphDir: join(root, "graph"),
    graphNodesDir: join(root, "graph", "nodes"),
    graphDreamsDir: join(root, "graph", "dreams"),
    profilesDir: join(root, "profiles"),
  };
}

export async function bootstrapLayout(root: string): Promise<HiBitLayout> {
  const layout = layoutFor(root);
  await Promise.all([
    mkdir(layout.root, { recursive: true }),
    mkdir(layout.promptsDir, { recursive: true }),
    mkdir(layout.graphNodesDir, { recursive: true }),
    mkdir(layout.graphDreamsDir, { recursive: true }),
    mkdir(layout.profilesDir, { recursive: true }),
  ]);
  return layout;
}

export type ProfilePaths = {
  root: string;
  profileFile: string;
  stateFile: string;
  progressFile: string;
  agentsFile: string;
  claudeFile: string;
  projectsDir: string;
  flagsDir: string;
  transcriptsDir: string;
  sessionLogFile: string;
  claudeSettingsDir: string;
  claudeSettingsFile: string;
  opencodeConfigFile: string;
};

export function profilePathsFor(layout: HiBitLayout, profileId: string): ProfilePaths {
  const root = join(layout.profilesDir, profileId);
  const claudeSettingsDir = join(root, ".claude");
  return {
    root,
    profileFile: join(root, "profile.json"),
    stateFile: join(root, "state.md"),
    progressFile: join(root, "progress.json"),
    agentsFile: join(root, "AGENTS.md"),
    claudeFile: join(root, "CLAUDE.md"),
    projectsDir: join(root, "projects"),
    flagsDir: join(root, "flags"),
    transcriptsDir: join(root, "transcripts"),
    sessionLogFile: join(root, "session-log.jsonl"),
    claudeSettingsDir,
    claudeSettingsFile: join(claudeSettingsDir, "settings.json"),
    opencodeConfigFile: join(root, "opencode.json"),
  };
}

export async function bootstrapProfileDirs(paths: ProfilePaths): Promise<void> {
  await Promise.all([
    mkdir(paths.root, { recursive: true }),
    mkdir(paths.projectsDir, { recursive: true }),
    mkdir(paths.flagsDir, { recursive: true }),
    mkdir(paths.transcriptsDir, { recursive: true }),
    mkdir(paths.claudeSettingsDir, { recursive: true }),
  ]);
}
