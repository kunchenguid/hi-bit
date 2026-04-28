import { describe, expect, it } from "vitest";
import { BIT_CURSOR_MARKER, buildCursorMarkerPrompt } from "./cursorMarkerPrompt";

describe("buildCursorMarkerPrompt", () => {
  it("asks for strict JSON with the current unsaved editor content and snippet", () => {
    const prompt = buildCursorMarkerPrompt({
      filename: "index.html",
      editorContent: "<body>\n</body>",
      latestBitMessage: "Add a button inside the body.",
      snippet: "<button>Play</button>",
    });

    expect(prompt).toContain("Return only JSON matching this schema");
    expect(prompt).toContain("surrounding_content_with_marker");
    expect(prompt).toContain(BIT_CURSOR_MARKER);
    expect(prompt).toContain("Add a button inside the body.");
    expect(prompt).toContain("<body>\n</body>");
    expect(prompt).toContain("The excerpt without");
    expect(prompt).toContain("marker_label");
    expect(prompt).toContain("16 characters");
    expect(prompt).toContain("<button>Play</button>");
    expect(prompt).toContain("snippet");
  });
});
