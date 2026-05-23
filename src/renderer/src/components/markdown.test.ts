import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("parses bold, italic, and inline code", () => {
    expect(parseInline("Open **Cat Clicker** and try `npm run`")).toEqual([
      { type: "text", text: "Open " },
      { type: "strong", text: "Cat Clicker" },
      { type: "text", text: " and try " },
      { type: "code", text: "npm run" },
    ]);
    expect(parseInline("make it *orange*")).toEqual([
      { type: "text", text: "make it " },
      { type: "em", text: "orange" },
    ]);
    expect(parseInline("snake_case stays whole")).toEqual([
      { type: "text", text: "snake_case stays whole" },
    ]);
  });

  it("leaves unbalanced or spaced markers as plain text", () => {
    expect(parseInline("2 ** 3 is great")).toEqual([{ type: "text", text: "2 ** 3 is great" }]);
    expect(parseInline("nothing here")).toEqual([{ type: "text", text: "nothing here" }]);
  });
});

describe("parseMarkdown", () => {
  it("keeps single newlines as line breaks within a paragraph", () => {
    expect(parseMarkdown("Yay!\nBuilding now.")).toEqual([
      {
        type: "paragraph",
        lines: [[{ type: "text", text: "Yay!" }], [{ type: "text", text: "Building now." }]],
      },
    ]);
  });

  it("splits paragraphs on blank lines", () => {
    expect(parseMarkdown("Hi there\n\nWhat next?")).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: "Hi there" }]] },
      { type: "paragraph", lines: [[{ type: "text", text: "What next?" }]] },
    ]);
  });

  it("groups bullet lines into a list with inline formatting", () => {
    expect(parseMarkdown("Done:\n- a **cat**\n- a score")).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: "Done:" }]] },
      {
        type: "list",
        items: [
          [
            { type: "text", text: "a " },
            { type: "strong", text: "cat" },
          ],
          [{ type: "text", text: "a score" }],
        ],
      },
    ]);
  });

  it("returns an empty list of blocks for empty text", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n  ")).toEqual([]);
  });
});
