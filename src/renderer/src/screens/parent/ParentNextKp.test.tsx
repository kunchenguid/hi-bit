// @vitest-environment jsdom
import type { Dream, DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import { emptyProgress } from "@shared/progress";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ParentNextKp } from "./ParentNextKp";

function makeDream(): Dream {
  return {
    id: "playground",
    mode: "freeform",
    title_parent: "Playground",
    title_kid: "playground",
    summary_kid: "Build anything.",
    categories: ["creative"],
    interest_tags: [],
    requires: [],
    style_hints: [],
    emoji: "✨",
    difficulty: 1,
  };
}

function libraryOf(dream: Dream): DreamLibrary {
  return { dreams: [dream], byId: { [dream.id]: dream } };
}

function emptyGraph(): KnowledgeGraph {
  return { nodes: [], byId: {} };
}

describe("ParentNextKp", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("explains that freeform dreams have no fixed skill plan", async () => {
    const dream = makeDream();

    await act(async () => {
      root.render(
        <ParentNextKp
          graph={emptyGraph()}
          library={libraryOf(dream)}
          currentDreamId={dream.id}
          progress={emptyProgress()}
        />,
      );
    });

    expect(host.textContent).toContain("Free build mode has no fixed skill plan.");
    expect(host.textContent).not.toContain("The dream is shippable.");
  });
});
