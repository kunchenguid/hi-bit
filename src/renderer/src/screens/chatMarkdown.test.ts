import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./chatMarkdown";

describe("parseMarkdown", () => {
  it("treats a plain line as a paragraph", () => {
    expect(parseMarkdown("Hi Eddie.")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Hi Eddie." }] },
    ]);
  });

  it("splits paragraphs separated by a blank line", () => {
    const blocks = parseMarkdown("first paragraph.\n\nsecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[1].type).toBe("paragraph");
  });

  it("recognizes a fenced code block with language", () => {
    const blocks = parseMarkdown("intro\n\n```html\n<h1>Hi</h1>\n```\n\nafter");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual({
      type: "code-block",
      lang: "html",
      text: "<h1>Hi</h1>",
      practice: false,
    });
  });

  it("preserves multi-line code-block content verbatim", () => {
    const blocks = parseMarkdown("```\nline 1\nline 2\n```");
    expect(blocks[0]).toEqual({
      type: "code-block",
      lang: null,
      text: "line 1\nline 2",
      practice: false,
    });
  });

  it("flags a fenced code block as practice when the fence ends with 'practice'", () => {
    const blocks = parseMarkdown("```html practice\n<h1>Eddie</h1>\n```");
    expect(blocks[0]).toEqual({
      type: "code-block",
      lang: "html",
      text: "<h1>Eddie</h1>",
      practice: true,
    });
  });

  it("flags a no-language fence as practice when the fence is ```practice", () => {
    const blocks = parseMarkdown("```practice\nh1 yourself\n```");
    expect(blocks[0]).toEqual({
      type: "code-block",
      lang: null,
      text: "h1 yourself",
      practice: true,
    });
  });

  it("ignores trailing whitespace after the practice flag", () => {
    const blocks = parseMarkdown("```css practice   \n.color { color: red; }\n```");
    expect(blocks[0]).toEqual({
      type: "code-block",
      lang: "css",
      text: ".color { color: red; }",
      practice: true,
    });
  });

  it("treats unrecognized flags after the language as the language token only", () => {
    const blocks = parseMarkdown("```js something\n1 + 1\n```");
    expect(blocks[0]).toEqual({
      type: "code-block",
      lang: "js",
      text: "1 + 1",
      practice: false,
    });
  });

  it("renders a blockquote line", () => {
    const blocks = parseMarkdown("> Eddie loves chess");
    expect(blocks).toEqual([
      {
        type: "blockquote",
        children: [{ type: "text", text: "Eddie loves chess" }],
      },
    ]);
  });

  it("collapses contiguous blockquote lines into one block", () => {
    const blocks = parseMarkdown("> first line\n> second line");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("blockquote");
  });

  it("recognizes headings of multiple levels", () => {
    const blocks = parseMarkdown("# big\n\n### smaller");
    expect(blocks).toEqual([
      { type: "heading", level: 1, children: [{ type: "text", text: "big" }] },
      { type: "heading", level: 3, children: [{ type: "text", text: "smaller" }] },
    ]);
  });

  it("recognizes unordered lists", () => {
    const blocks = parseMarkdown("- one\n- two");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]],
      },
    ]);
  });

  it("recognizes ordered lists", () => {
    const blocks = parseMarkdown("1. first\n2. second");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: [[{ type: "text", text: "first" }], [{ type: "text", text: "second" }]],
      },
    ]);
  });

  it("does not interpret a stray '*' as italic when no closer is present", () => {
    const blocks = parseMarkdown("a * b");
    expect(blocks).toEqual([{ type: "paragraph", children: [{ type: "text", text: "a * b" }] }]);
  });

  it("keeps angle-bracket text intact (no HTML interpretation)", () => {
    const blocks = parseMarkdown("look at <h1>Hello!</h1>.");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "look at <h1>Hello!</h1>." }],
      },
    ]);
  });

  it("breaks a paragraph when a code fence starts on the next line", () => {
    const blocks = parseMarkdown("intro\n```\ncode\n```");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[1].type).toBe("code-block");
  });

  it("handles an unclosed code fence by consuming the rest of the input", () => {
    const blocks = parseMarkdown("```js\nrest\nof\ninput");
    expect(blocks).toEqual([
      { type: "code-block", lang: "js", text: "rest\nof\ninput", practice: false },
    ]);
  });
});

describe("parseInline", () => {
  it("parses inline code", () => {
    expect(parseInline("the `<h1>` tag")).toEqual([
      { type: "text", text: "the " },
      { type: "code", text: "<h1>" },
      { type: "text", text: " tag" },
    ]);
  });

  it("parses bold text", () => {
    expect(parseInline("hi **Eddie**!")).toEqual([
      { type: "text", text: "hi " },
      { type: "bold", children: [{ type: "text", text: "Eddie" }] },
      { type: "text", text: "!" },
    ]);
  });

  it("parses italic text", () => {
    expect(parseInline("a *bit* of italic")).toEqual([
      { type: "text", text: "a " },
      { type: "italic", children: [{ type: "text", text: "bit" }] },
      { type: "text", text: " of italic" },
    ]);
  });

  it("prefers bold over italic when both are possible", () => {
    expect(parseInline("**bold**")).toEqual([
      { type: "bold", children: [{ type: "text", text: "bold" }] },
    ]);
  });

  it("parses links with allowed schemes", () => {
    expect(parseInline("see [docs](https://example.com)")).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        href: "https://example.com",
        children: [{ type: "text", text: "docs" }],
      },
    ]);
  });

  it("rejects links with disallowed schemes (e.g. javascript:)", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([
      { type: "text", text: "[click](javascript:alert(1))" },
    ]);
  });
});
