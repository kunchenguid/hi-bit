import { describe, expect, it } from "vitest";
import { buildSavedFilePrompt, savedFilePromptLabel } from "./saveReaction";

describe("buildSavedFilePrompt", () => {
  it("tells Bit which file was saved and includes a line diff", () => {
    const prompt = buildSavedFilePrompt({
      profileId: "ada",
      filename: "index.html",
      slug: "pet-site",
      before: "<h1>Cat</h1>\n<p>hello</p>",
      after: "<h1>Cat</h1>\n<p>hello</p>\n<button>Feed</button>",
    });

    expect(prompt).toContain("The kid just clicked Save in Hi Bit.");
    expect(prompt).toContain("File saved: index.html");
    expect(prompt).toContain("Project: pet-site");
    expect(prompt).toContain("```diff\n <h1>Cat</h1>\n <p>hello</p>\n+<button>Feed</button>\n```");
    expect(prompt).toContain("Use the diff below instead of reading the file first");
  });

  it("tells Bit not to ask for See my page when Save refreshed a visible split preview", () => {
    const prompt = buildSavedFilePrompt({
      profileId: "ada",
      filename: "index.html",
      slug: "pet-site",
      before: "<h1>My Name</h1>",
      after: "<h1>Ada</h1>",
      previewVisible: true,
    });

    expect(prompt).toContain("Save already refreshed the live preview");
    expect(prompt).toContain(
      "Do not ask the kid to press See my page just to see this saved change",
    );
  });

  it("allows Bit to ask for See my page when the saved preview is hidden", () => {
    const prompt = buildSavedFilePrompt({
      profileId: "ada",
      filename: "index.html",
      slug: "pet-site",
      before: "<h1>My Name</h1>",
      after: "<h1>Ada</h1>",
      previewVisible: false,
    });

    expect(prompt).toContain("Save refreshed the live preview in the background");
    expect(prompt).toContain("the preview is hidden in Code view");
    expect(prompt).toContain("ask them to press See my page");
    expect(prompt).not.toContain(
      "Do not ask the kid to press See my page just to see this saved change",
    );
  });

  it("opens with a system-note marker so Bit can tell it isn't from the kid", () => {
    const prompt = buildSavedFilePrompt({
      profileId: "ada",
      filename: "index.html",
      slug: "pet-site",
      before: "a",
      after: "b",
    });
    const firstLine = prompt.split("\n")[0];
    expect(firstLine).toMatch(/system note/i);
    expect(firstLine.toLowerCase()).toContain("hi-bit");
    expect(firstLine.toLowerCase()).toContain("not");
  });
});

describe("savedFilePromptLabel", () => {
  it("recognizes the new system-marker format", () => {
    const prompt = buildSavedFilePrompt({
      profileId: "ada",
      filename: "index.html",
      slug: "pet-site",
      before: "a",
      after: "b",
    });
    expect(savedFilePromptLabel(prompt)).toBe("Saved index.html");
  });

  it("still recognizes the legacy format without the system-marker line", () => {
    const legacy = [
      "The kid just clicked Save in Hi Bit.",
      "File saved: legacy.html",
      "Project: old",
      "Use the diff below instead of reading the file first.",
      "",
      "```diff",
      "+a",
      "```",
    ].join("\n");
    expect(savedFilePromptLabel(legacy)).toBe("Saved legacy.html");
  });

  it("returns null for unrelated text", () => {
    expect(savedFilePromptLabel("hello")).toBeNull();
  });
});
