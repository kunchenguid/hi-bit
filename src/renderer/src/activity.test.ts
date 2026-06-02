import type { ChatEvent, CreationActivity } from "@shared/chat";
import { describe, expect, it } from "vitest";
import { applyEventToActivity, summarizeActivity } from "./activity";

function meta(over: Partial<{ projectId: string; projectTitle: string }>) {
  return { profileId: "p", turnId: "t", ...over };
}

describe("applyEventToActivity", () => {
  it("opens a working creation on build_start", () => {
    const next = applyEventToActivity([], {
      type: "build_start",
      ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
    });
    expect(next).toEqual([
      { projectId: "a", title: "Cat Jump", status: "working", updatedAt: "", steps: [] },
    ]);
  });

  it("adds a running step on tool_start and completes it on tool_end", () => {
    let activity: CreationActivity[] = [];
    const events: ChatEvent[] = [
      { type: "build_start", ...meta({ projectId: "a", projectTitle: "Cat Jump" }) },
      {
        type: "tool_start",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        callId: "c1",
        toolName: "write",
        args: {},
      },
      {
        type: "tool_end",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        callId: "c1",
        isError: false,
        content: [],
      },
    ];
    for (const event of events) activity = applyEventToActivity(activity, event);

    expect(activity).toHaveLength(1);
    expect(activity[0].status).toBe("working"); // stays working until build_end
    expect(activity[0].steps).toEqual([
      {
        callId: "c1",
        turnId: "t",
        toolName: "write",
        status: "completed",
        args: {},
        content: [],
        projectId: "a",
        projectTitle: "Cat Jump",
      },
    ]);
  });

  it("marks the creation done on build_end without dropping its steps", () => {
    let activity: CreationActivity[] = [];
    for (const event of [
      { type: "build_start", ...meta({ projectId: "a", projectTitle: "Cat Jump" }) },
      {
        type: "tool_start",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        callId: "c1",
        toolName: "write",
        args: {},
      },
      {
        type: "build_end",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        status: "completed",
      },
    ] as ChatEvent[]) {
      activity = applyEventToActivity(activity, event);
    }
    expect(activity[0].status).toBe("done");
    expect(activity[0].steps).toHaveLength(1);
  });

  it("closes running steps from the same turn on build_end", () => {
    let activity: CreationActivity[] = [];
    for (const event of [
      { type: "build_start", ...meta({ projectId: "a", projectTitle: "Cat Jump" }) },
      {
        type: "tool_start",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        callId: "c1",
        toolName: "write",
        args: {},
      },
      {
        type: "build_end",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        status: "failed",
      },
    ] as ChatEvent[]) {
      activity = applyEventToActivity(activity, event);
    }

    expect(activity[0].steps).toMatchObject([{ callId: "c1", turnId: "t", status: "failed" }]);
  });

  it("keeps same-call tool steps separate across concurrent turns", () => {
    let activity: CreationActivity[] = [];
    for (const event of [
      { type: "build_start", ...meta({ projectId: "a", projectTitle: "Cat Jump" }) },
      {
        type: "tool_start",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        callId: "c1",
        toolName: "write",
        args: { path: "one" },
      },
      {
        type: "tool_start",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        turnId: "other-turn",
        callId: "c1",
        toolName: "read",
        args: { path: "two" },
      },
      {
        type: "tool_end",
        ...meta({ projectId: "a", projectTitle: "Cat Jump" }),
        callId: "c1",
        isError: false,
        content: [],
      },
    ] as ChatEvent[]) {
      activity = applyEventToActivity(activity, event);
    }

    expect(activity[0].steps).toMatchObject([
      { callId: "c1", turnId: "t", toolName: "write", status: "completed" },
      { callId: "c1", turnId: "other-turn", toolName: "read", status: "running" },
    ]);
  });

  it("moves the freshly started creation to the front", () => {
    const existing: CreationActivity[] = [
      { projectId: "a", title: "Cat Jump", status: "done", updatedAt: "", steps: [] },
    ];
    const next = applyEventToActivity(existing, {
      type: "build_start",
      ...meta({ projectId: "b", projectTitle: "Space Site" }),
    });
    expect(next.map((c) => c.projectId)).toEqual(["b", "a"]);
  });
});

describe("summarizeActivity", () => {
  const working = (id: string, title: string): CreationActivity => ({
    projectId: id,
    title,
    status: "working",
    updatedAt: "",
    steps: [{ callId: `${id}-1`, toolName: "write", status: "running", content: [] }],
  });

  it("names the single creation a bot is working on", () => {
    const summary = summarizeActivity([working("a", "Cat Jump")]);
    expect(summary.working).toBe(true);
    expect(summary.headline).toBe("A bot is working on Cat Jump");
  });

  it("pluralizes when several bots are working", () => {
    const summary = summarizeActivity([working("a", "Cat Jump"), working("b", "Space Site")]);
    expect(summary.headline).toBe("2 bots are working in your factory");
  });

  it("rests with the most recent creation when nothing is working", () => {
    const summary = summarizeActivity([
      { projectId: "a", title: "Cat Jump", status: "done", updatedAt: "", steps: [] },
    ]);
    expect(summary.working).toBe(false);
    expect(summary.headline).toBe("All caught up");
    expect(summary.detail).toBe("last worked on Cat Jump");
  });

  it("rests gently when there is no history yet", () => {
    const summary = summarizeActivity([]);
    expect(summary.working).toBe(false);
    expect(summary.headline).toBe("Ready when you are");
    expect(summary.detail).toBe("");
    expect(summary.count).toBe(0);
  });

  it("counts total steps across creations", () => {
    const summary = summarizeActivity([working("a", "Cat Jump"), working("b", "Space Site")]);
    expect(summary.count).toBe(2);
  });

  it("reports Bit thinking when a turn is running with no build activity", () => {
    const summary = summarizeActivity([], true);
    expect(summary.working).toBe(true);
    expect(summary.headline).toBe("Bit is thinking");
    expect(summary.detail).toBe("");
  });

  it("prefers a working build over the thinking state", () => {
    const summary = summarizeActivity([working("a", "Cat Jump")], true);
    expect(summary.headline).toBe("A bot is working on Cat Jump");
  });
});
