import { describe, expect, it } from "vitest";
import {
  buildLearnerActivityPrompt,
  inferExpectedLearnerAction,
  learnerActivityPromptLabel,
} from "./learnerActivity";

describe("learner activity prompts", () => {
  it("builds a hidden editor-opened prompt with a stable chat label", () => {
    const prompt = buildLearnerActivityPrompt({ type: "editor.opened" });

    expect(prompt).toContain("[Hi-Bit system note - this is from the app UI, not from the kid]");
    expect(prompt).toContain("Activity: editor.opened");
    expect(prompt).toContain("The kid just opened the code editor.");
    expect(prompt).toContain("Keep the reply short");
    expect(learnerActivityPromptLabel(prompt)).toBe("Opened editor");
  });

  it("builds a hidden preview-opened prompt that guides Bit to explain the live page", () => {
    const prompt = buildLearnerActivityPrompt({ type: "preview.opened" });

    expect(prompt).toContain("Activity: preview.opened");
    expect(prompt).toContain("The kid just clicked See my page and opened the live preview.");
    expect(prompt).toContain("help them connect the page they see to the code they are changing");
    expect(learnerActivityPromptLabel(prompt)).toBe("Opened page preview");
  });

  it("builds a hidden matched-action prompt for workspace view changes", () => {
    const prompt = buildLearnerActivityPrompt({ type: "workspace.view.split" });

    expect(prompt).toContain("Activity: workspace.view.split");
    expect(prompt).toContain("The kid just switched the workspace to Split view.");
    expect(learnerActivityPromptLabel(prompt)).toBe("Clicked Split");
  });

  it("infers exact expected actions from known UI button instructions", () => {
    expect(inferExpectedLearnerAction("Click Split so we can see both sides.")).toEqual({
      type: "workspace.view.split",
      label: "Clicked Split",
      source: "inferred",
    });
    expect(inferExpectedLearnerAction("Maybe split this into two parts.")).toBeNull();
  });
});
