// A tiny, safe markdown parser for Bit's chat messages. It covers the subset Bit
// actually writes - bold, italic, inline code, line breaks, and simple bullet lists -
// and produces a plain data structure that renders to React nodes (never raw HTML),
// so kid-facing, model-authored text can never inject markup.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string };

export type Block =
  | { type: "paragraph"; lines: InlineNode[][] }
  | { type: "list"; items: InlineNode[][] };

// Bold, inline code, and `*italic*`. Underscores are intentionally not emphasis
// markers so identifiers like snake_case stay intact.
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, start) });
    }
    if (token.startsWith("**")) {
      nodes.push({ type: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      nodes.push({ type: "code", text: token.slice(1, -1) });
    } else {
      nodes.push({ type: "em", text: token.slice(1, -1) });
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }
  return nodes;
}

function isBullet(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

function bulletContent(line: string): string {
  return line.replace(/^\s*[-*]\s+/, "");
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  let paragraph: InlineNode[][] = [];
  let list: InlineNode[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (isBullet(line)) {
      flushParagraph();
      list.push(parseInline(bulletContent(line)));
      continue;
    }
    flushList();
    paragraph.push(parseInline(line));
  }
  flushParagraph();
  flushList();
  return blocks;
}
