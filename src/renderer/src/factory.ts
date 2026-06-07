import type { CreationActivity, ToolActivity } from "@shared/chat";
import type { ProjectSummary } from "@shared/project";
import { friendlyStep } from "./activity";

/**
 * One bot working a creation. A bot is a single background job; every tool step
 * already carries that job's id as `turnId`, so grouping a creation's steps by
 * `turnId` recovers the bots with no extra data from the main process. Bots have
 * no names - identity is the stable color from {@link botHue} plus their face.
 */
export type BotLane = {
  /** The bot job id (a step's `turnId`), stable for the life of the build. */
  botId: string;
  /** A stable hue (0-359) so the same bot always wears the same color. */
  hue: number;
  /** Whether this bot still has a step in flight. */
  working: boolean;
  /** What the bot is doing now (its running step) or last did, in kid words. */
  latestAction: string;
  /** The bot's task - what Bit asked it to build. Names the bot in the Logbook. */
  summary?: string;
  /** This bot's steps, in the order they happened - its Logbook. */
  steps: ToolActivity[];
};

/** One machine on the factory floor: a creation plus the bots building it. */
export type CreationFloor = {
  projectId: string;
  title: string;
  status: "working" | "done";
  playable: boolean;
  /** How many bots are working this creation right now. */
  workingBots: number;
  bots: BotLane[];
  /** The creation's latest action, or null when nothing has happened yet. */
  latestAction: string | null;
  updatedAt: string;
};

/** A stable hue (0-359) derived from a bot id, so a bot keeps one color. */
export function botHue(botId: string): number {
  let hash = 0;
  for (let i = 0; i < botId.length; i += 1) {
    hash = (hash * 31 + botId.charCodeAt(i)) % 360;
  }
  return ((hash % 360) + 360) % 360;
}

/** The lanes for one creation: its steps grouped by bot, newest bot last. */
function lanesFor(activity: CreationActivity | undefined): BotLane[] {
  if (!activity) return [];
  const order: string[] = [];
  const byBot = new Map<string, ToolActivity[]>();
  for (const step of activity.steps) {
    const botId = step.turnId ?? "bot";
    if (!byBot.has(botId)) {
      order.push(botId);
      byBot.set(botId, []);
    }
    byBot.get(botId)?.push(step);
  }

  const lanes = order.map((botId) => {
    const steps = byBot.get(botId) ?? [];
    const working = steps.some((step) => step.status === "running");
    const headline = [...steps].reverse().find((step) => step.status === "running") ?? steps.at(-1);
    return {
      botId,
      hue: botHue(botId),
      working,
      latestAction: headline ? friendlyStep(headline.toolName) : "getting started",
      summary: steps.find((step) => step.summary)?.summary,
      steps,
    } satisfies BotLane;
  });

  if (activity.status === "working" && !lanes.some((lane) => lane.working)) {
    const lastLane = lanes.at(-1);
    if (lastLane) {
      lastLane.working = true;
      return lanes;
    }

    lanes.push({
      botId: `${activity.projectId}:pending`,
      hue: botHue(activity.projectId),
      working: true,
      latestAction: "getting started",
      summary: undefined,
      steps: [],
    });
  }
  return lanes;
}

/**
 * Joins the kid's creations with their live activity into the factory floor:
 * one machine per creation, newest first, each carrying its bots. Creations with
 * no activity show as quiet machines; a live build whose creation has not yet
 * landed in the list is still surfaced so nothing in flight disappears.
 */
export function buildFactoryFloor(
  creations: ProjectSummary[],
  activity: CreationActivity[],
  playableProjectIds: Set<string>,
): CreationFloor[] {
  const activityById = new Map(activity.map((entry) => [entry.projectId, entry]));
  const seen = new Set<string>();
  const rows: Array<{ projectId: string; title: string; updatedAt: string; working: boolean }> = [];

  for (const creation of creations) {
    seen.add(creation.id);
    const entry = activityById.get(creation.id);
    const updatedAt =
      entry?.updatedAt && entry.updatedAt.localeCompare(creation.updatedAt) > 0
        ? entry.updatedAt
        : creation.updatedAt;
    rows.push({
      projectId: creation.id,
      title: creation.title,
      updatedAt,
      working: entry?.status === "working",
    });
  }
  for (const entry of activity) {
    if (seen.has(entry.projectId)) continue;
    seen.add(entry.projectId);
    rows.push({
      projectId: entry.projectId,
      title: entry.title,
      updatedAt: entry.updatedAt,
      working: entry.status === "working",
    });
  }

  return rows
    .sort((a, b) => Number(b.working) - Number(a.working) || b.updatedAt.localeCompare(a.updatedAt))
    .map((row) => {
      const entry = activityById.get(row.projectId);
      const bots = lanesFor(entry);
      const headlineStep =
        entry?.steps.findLast((step) => step.status === "running") ?? entry?.steps.at(-1);
      return {
        projectId: row.projectId,
        title: row.title,
        status: entry?.status ?? "done",
        playable: playableProjectIds.has(row.projectId),
        workingBots: bots.filter((bot) => bot.working).length,
        bots,
        latestAction: headlineStep ? friendlyStep(headlineStep.toolName) : null,
        updatedAt: row.updatedAt,
      } satisfies CreationFloor;
    });
}

/** Total bots working across every creation - the live badge on the Factory button. */
export function countWorkingBots(activity: CreationActivity[]): number {
  return activity.reduce((total, entry) => total + lanesForWorkingCount(entry), 0);
}

function lanesForWorkingCount(activity: CreationActivity): number {
  return lanesFor(activity).filter((lane) => lane.working).length;
}
