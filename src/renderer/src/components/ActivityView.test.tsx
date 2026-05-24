// @vitest-environment jsdom

import type { CreationActivity } from "@shared/chat";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityView } from "./ActivityView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("ActivityView", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("keys same-call steps by turn id", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const activity: CreationActivity[] = [
      {
        projectId: "cat-jump",
        title: "Cat Jump",
        status: "working",
        updatedAt: "",
        steps: [
          { callId: "w1", turnId: "bot_job_1", toolName: "write", status: "running", content: [] },
          { callId: "w1", turnId: "bot_job_2", toolName: "read", status: "running", content: [] },
        ],
      },
    ];

    act(() => root.render(<ActivityView activity={activity} onClose={() => {}} />));

    expect(error.mock.calls.join("\n")).not.toContain("Encountered two children with the same key");
  });
});
