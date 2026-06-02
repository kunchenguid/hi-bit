import type { CreationActivity, ToolActivity } from "@shared/chat";
import type { ProjectSummary } from "@shared/project";
import { describe, expect, it } from "vitest";
import { botHue, buildFactoryFloor, countWorkingBots } from "./factory";

function step(turnId: string, toolName: string, status: ToolActivity["status"]): ToolActivity {
  return { callId: `${turnId}:${toolName}`, turnId, toolName, status, content: [] };
}

function creation(
  projectId: string,
  title: string,
  status: CreationActivity["status"],
  steps: ToolActivity[],
  updatedAt = "2026-01-01T00:00:00.000Z",
): CreationActivity {
  return { projectId, title, status, updatedAt, steps };
}

function project(id: string, title: string, updatedAt: string): ProjectSummary {
  return {
    schemaVersion: 1,
    id,
    profileId: "p",
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

describe("buildFactoryFloor", () => {
  it("groups each creation's steps into one bot lane per turnId", () => {
    const activity = [
      creation(
        "dino",
        "Dino Dash",
        "working",
        [
          step("job1", "write", "running"),
          step("job1", "read", "completed"),
          step("job2", "edit", "running"),
        ],
        "2026-02-02T00:00:00.000Z",
      ),
    ];
    const floor = buildFactoryFloor(
      [project("dino", "Dino Dash", "2026-02-02T00:00:00.000Z")],
      activity,
      new Set(),
    );

    expect(floor).toHaveLength(1);
    const dino = floor[0];
    expect(dino.bots.map((bot) => bot.botId)).toEqual(["job1", "job2"]);
    expect(dino.workingBots).toBe(2);
    // The lane's ticker prefers what the bot is doing right now (its running step).
    const job1 = dino.bots[0];
    expect(job1.steps).toHaveLength(2);
    expect(job1.working).toBe(true);
    expect(job1.latestAction).toBe("writing files");
  });

  it("orders machines newest first and flags playability", () => {
    const floor = buildFactoryFloor(
      [
        project("maze", "My Maze", "2026-01-01T00:00:00.000Z"),
        project("dino", "Dino Dash", "2026-02-02T00:00:00.000Z"),
      ],
      [
        creation("dino", "Dino Dash", "working", [step("j", "write", "running")], "2026-02-02"),
        creation("maze", "My Maze", "done", [step("j0", "write", "completed")], "2026-01-01"),
      ],
      new Set(["maze"]),
    );

    expect(floor.map((machine) => machine.projectId)).toEqual(["dino", "maze"]);
    expect(floor[0].playable).toBe(false);
    expect(floor[1].playable).toBe(true);
    expect(floor[1].status).toBe("done");
    expect(floor[1].workingBots).toBe(0);
  });

  it("uses newer activity timestamps when ordering existing creations", () => {
    const floor = buildFactoryFloor(
      [
        project("maze", "My Maze", "2026-02-01T00:00:00.000Z"),
        project("dino", "Dino Dash", "2026-01-01T00:00:00.000Z"),
      ],
      [creation("dino", "Dino Dash", "done", [step("j", "write", "completed")], "2026-03-01T00:00:00.000Z")],
      new Set(),
    );

    expect(floor.map((machine) => machine.projectId)).toEqual(["dino", "maze"]);
    expect(floor[0].updatedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("keeps working creations ahead of newer idle creations", () => {
    const floor = buildFactoryFloor(
      [
        project("idle", "Idle Site", "2026-03-01T00:00:00.000Z"),
        project("active", "Active Game", "2026-01-01T00:00:00.000Z"),
      ],
      [creation("active", "Active Game", "working", [step("j", "write", "running")])],
      new Set(),
    );

    expect(floor.map((machine) => machine.projectId)).toEqual(["active", "idle"]);
  });

  it("shows idle creations with no activity as quiet machines", () => {
    const floor = buildFactoryFloor(
      [project("new", "New Thing", "2026-03-03T00:00:00.000Z")],
      [],
      new Set(),
    );

    expect(floor).toHaveLength(1);
    expect(floor[0].status).toBe("done");
    expect(floor[0].bots).toHaveLength(0);
    expect(floor[0].workingBots).toBe(0);
    expect(floor[0].latestAction).toBeNull();
  });

  it("keeps a live build visible even before its creation lands in the list", () => {
    const floor = buildFactoryFloor(
      [],
      [creation("x", "Mystery", "working", [step("j", "write", "running")], "2026-01-05")],
      new Set(),
    );

    expect(floor.map((machine) => machine.projectId)).toEqual(["x"]);
    expect(floor[0].workingBots).toBe(1);
  });

  it("shows a pending bot when a build started but has no steps yet", () => {
    const floor = buildFactoryFloor(
      [project("p", "P", "2026-01-01T00:00:00.000Z")],
      [creation("p", "P", "working", [])],
      new Set(),
    );

    expect(floor[0].workingBots).toBe(1);
    expect(floor[0].bots).toHaveLength(1);
    expect(floor[0].bots[0].working).toBe(true);
    expect(floor[0].bots[0].steps).toHaveLength(0);
  });

  it("keeps a working build on its existing bot lane between steps", () => {
    const floor = buildFactoryFloor(
      [project("p", "P", "2026-01-01T00:00:00.000Z")],
      [creation("p", "P", "working", [step("j", "write", "completed")])],
      new Set(),
    );

    expect(floor[0].workingBots).toBe(1);
    expect(floor[0].bots).toHaveLength(1);
    expect(floor[0].bots[0].botId).toBe("j");
    expect(floor[0].bots[0].working).toBe(true);
    expect(floor[0].bots[0].steps).toHaveLength(1);
  });

  it("uses a running bot action before a later completed step", () => {
    const floor = buildFactoryFloor(
      [project("p", "P", "2026-01-01T00:00:00.000Z")],
      [
        creation("p", "P", "working", [
          step("j1", "write", "running"),
          step("j2", "read", "completed"),
        ]),
      ],
      new Set(),
    );

    expect(floor[0].latestAction).toBe("writing files");
  });
});

describe("countWorkingBots", () => {
  it("sums working bot lanes across every creation", () => {
    const count = countWorkingBots([
      creation("a", "A", "working", [
        step("j1", "write", "running"),
        step("j2", "edit", "running"),
      ]),
      creation("b", "B", "working", []),
      creation("c", "C", "done", [step("j3", "write", "completed")]),
    ]);
    // a: 2 running bots, b: 1 pending, c: 0 done.
    expect(count).toBe(3);
  });
});

describe("botHue", () => {
  it("is deterministic and within the color wheel", () => {
    expect(botHue("job1")).toBe(botHue("job1"));
    expect(botHue("job1")).toBeGreaterThanOrEqual(0);
    expect(botHue("job1")).toBeLessThan(360);
    // Different ids generally land on different hues.
    expect(botHue("job1")).not.toBe(botHue("totally-different-id"));
  });
});
