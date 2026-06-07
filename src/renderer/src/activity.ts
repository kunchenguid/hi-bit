import type { ChatEvent, CreationActivity, ToolActivity } from "@shared/chat";

/**
 * Folds a chat event into the per-creation activity log the renderer holds.
 * `build_start`/`build_end` drive a creation's working/done status; `tool_*`
 * events add and update its steps. Pure and immutable so it is easy to test.
 */
export function applyEventToActivity(
  activity: CreationActivity[],
  event: ChatEvent,
): CreationActivity[] {
  switch (event.type) {
    case "build_start": {
      if (!event.projectId) return activity;
      const rest = activity.filter((creation) => creation.projectId !== event.projectId);
      const existing = activity.find((creation) => creation.projectId === event.projectId);
      return [
        {
          projectId: event.projectId,
          title: event.projectTitle ?? existing?.title ?? "your creation",
          status: "working",
          updatedAt: existing?.updatedAt ?? "",
          steps: existing?.steps ?? [],
        },
        ...rest,
      ];
    }
    case "build_end": {
      if (!event.projectId) return activity;
      return activity.map((creation) =>
        creation.projectId === event.projectId
          ? {
              ...creation,
              status: "done",
              steps: creation.steps.map((step) =>
                step.status === "running" && step.turnId === event.turnId
                  ? { ...step, status: event.status === "completed" ? "completed" : "failed" }
                  : step,
              ),
            }
          : creation,
      );
    }
    case "tool_start": {
      const step: ToolActivity = {
        callId: event.callId,
        toolName: event.toolName,
        status: "running",
        args: event.args,
        content: [],
        turnId: event.turnId,
        projectId: event.projectId,
        projectTitle: event.projectTitle,
        summary: event.summary,
      };
      return upsertStep(activity, event, step, (steps) => [
        ...steps.filter((existing) => !isSameStep(existing, event)),
        step,
      ]);
    }
    case "tool_update": {
      return mapStep(activity, event, (step) => ({
        ...step,
        content: event.content,
      }));
    }
    case "tool_end": {
      return mapStep(activity, event, (step) => ({
        ...step,
        status: event.isError ? "failed" : "completed",
        content: event.content,
      }));
    }
    default:
      return activity;
  }
}

/** Chip-level summary: is a bot working, what to say, and how many steps so far. */
export type ActivitySummary = {
  working: boolean;
  headline: string;
  detail: string;
  count: number;
};

export function summarizeActivity(activity: CreationActivity[], running = false): ActivitySummary {
  const count = activity.reduce((total, creation) => total + creation.steps.length, 0);
  const workingCreations = activity.filter((creation) => creation.status === "working");

  if (workingCreations.length > 0) {
    const headline =
      workingCreations.length === 1
        ? `A bot is working on ${workingCreations[0].title}`
        : `${workingCreations.length} bots are working in your factory`;
    return { working: true, headline, detail: currentStepDetail(workingCreations), count };
  }

  // No bot is mid-build, but Bit's own turn is still in flight: keep the
  // heartbeat alive so the kid sees Bit is thinking, not stalled.
  if (running) {
    return { working: true, headline: "Bit is thinking", detail: "", count };
  }

  const recent = activity[0];
  return {
    working: false,
    headline: recent ? "All caught up" : "Ready when you are",
    detail: recent ? `last worked on ${recent.title}` : "",
    count,
  };
}

function currentStepDetail(workingCreations: CreationActivity[]): string {
  for (const creation of workingCreations) {
    const running = [...creation.steps].reverse().find((step) => step.status === "running");
    if (running) return friendlyStep(running.toolName);
  }
  return "";
}

const STEP_VERBS: Record<string, string> = {
  write: "writing files",
  edit: "editing files",
  read: "reading files",
  ls: "looking at files",
  compact_context: "tidying up",
  retry: "trying again",
};

export function friendlyStep(toolName: string): string {
  return STEP_VERBS[toolName] ?? `running ${toolName}`;
}

function upsertStep(
  activity: CreationActivity[],
  event: ChatEvent & { callId: string; turnId: string; projectId?: string; projectTitle?: string },
  fallbackStep: ToolActivity,
  nextSteps: (steps: ToolActivity[]) => ToolActivity[],
): CreationActivity[] {
  if (!event.projectId) return activity;
  const existing = activity.find((creation) => creation.projectId === event.projectId);
  if (!existing) {
    return [
      {
        projectId: event.projectId,
        title: event.projectTitle ?? "your creation",
        status: "working",
        updatedAt: "",
        steps: [fallbackStep],
      },
      ...activity,
    ];
  }
  return activity.map((creation) =>
    creation.projectId === event.projectId
      ? { ...creation, steps: nextSteps(creation.steps) }
      : creation,
  );
}

function mapStep(
  activity: CreationActivity[],
  event: ChatEvent & { callId: string; turnId: string; projectId?: string },
  update: (step: ToolActivity) => ToolActivity,
): CreationActivity[] {
  if (!event.projectId) return activity;
  return activity.map((creation) =>
    creation.projectId === event.projectId
      ? {
          ...creation,
          steps: creation.steps.map((step) => (isSameStep(step, event) ? update(step) : step)),
        }
      : creation,
  );
}

function isSameStep(step: ToolActivity, event: { callId: string; turnId: string }): boolean {
  return step.callId === event.callId && step.turnId === event.turnId;
}
