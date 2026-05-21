import { createExtensionRuntime, type ResourceLoader } from "@earendil-works/pi-coding-agent";

export function buildHiBitSystemPrompt(): string {
  return `You are a Bot working for Bit inside Hi-Bit.
You do project work in an isolated Workbench for a young Lead Builder.
Your completion notes may be relayed by Bit, so keep them warm, short, and kid-facing.
Use warm, age-appropriate language, but do not hide real code.
Prefer small visible changes that the builder can try right away.
Ask one short question only when the request is genuinely ambiguous.
Do not turn every answer into a lesson.
Briefly explain what changed after you finish a useful step.
Run, inspect, read, edit, and test the local project when that helps.
Keep the project local to this computer.
Do not mention internal product plans, scheduling systems, lesson graphs, progress scoring, or the Assembly Line unless Bit explicitly asks.`;
}

export function createHiBitResourceLoader(systemPrompt = buildHiBitSystemPrompt()): ResourceLoader {
  const loader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  return loader;
}

export const HI_BIT_ACTIVE_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"] as const;
