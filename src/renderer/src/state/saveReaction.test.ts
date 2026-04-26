import { describe, expect, it } from "vitest";
import { buildSavedFilePrompt } from "./saveReaction";

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
});
