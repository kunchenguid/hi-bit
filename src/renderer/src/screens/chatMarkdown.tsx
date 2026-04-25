// Restricted Markdown parser + renderer for Bit's chat messages.
//
// Supported: paragraphs, headings (#..######), blockquote, fenced code blocks,
// unordered/ordered lists, inline code, bold (**), italic (*), links [text](url).
// Raw HTML is never honored - text comes back as-is, and the renderer puts it
// through React text nodes (no innerHTML).

import { type JSX, type ReactNode, useEffect, useRef, useState } from "react";

export type MdInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; children: MdInline[] }
  | { type: "italic"; children: MdInline[] }
  | { type: "link"; href: string; children: MdInline[] };

export type MdBlock =
  | { type: "paragraph"; children: MdInline[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: MdInline[] }
  | { type: "blockquote"; children: MdInline[] }
  | { type: "code-block"; lang: string | null; text: string; practice: boolean }
  | { type: "list"; ordered: boolean; items: MdInline[][] };

const FENCE = /^```(\w*)(?:\s+(\w+))?\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const BLOCKQUOTE = /^>\s?(.*)$/;
const UL_ITEM = /^[-*]\s+(.+)$/;
const OL_ITEM = /^\d+\.\s+(.+)$/;

export function parseMarkdown(input: string): MdBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  const isBlockStart = (line: string): boolean =>
    FENCE.test(line) ||
    HEADING.test(line) ||
    BLOCKQUOTE.test(line) ||
    UL_ITEM.test(line) ||
    OL_ITEM.test(line);

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const langToken = fence[1] || "";
      const flag = fence[2] ?? null;
      const lang = langToken === "" ? null : langToken === "practice" ? null : langToken;
      const practice = flag === "practice" || langToken === "practice";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ type: "code-block", lang, text: codeLines.join("\n"), practice });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, children: parseInline(heading[2]) });
      i++;
      continue;
    }

    if (BLOCKQUOTE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(BLOCKQUOTE);
        if (!m) break;
        quoteLines.push(m[1]);
        i++;
      }
      blocks.push({ type: "blockquote", children: parseInline(quoteLines.join("\n")) });
      continue;
    }

    if (UL_ITEM.test(line)) {
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = lines[i].match(UL_ITEM);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (OL_ITEM.test(line)) {
      const items: MdInline[][] = [];
      while (i < lines.length) {
        const m = lines[i].match(OL_ITEM);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Paragraph: gather lines until a blank line or another block start.
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (next.trim() === "") break;
      if (isBlockStart(next)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(paraLines.join("\n")) });
  }

  return blocks;
}

export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let buf = "";
  let i = 0;

  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ type: "text", text: buf });
      buf = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        out.push({ type: "bold", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "italic", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket > i && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket) {
          const href = text.slice(closeBracket + 2, closeParen).trim();
          if (isSafeHref(href)) {
            flush();
            out.push({
              type: "link",
              href,
              children: parseInline(text.slice(i + 1, closeBracket)),
            });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

function isSafeHref(href: string): boolean {
  if (href.length === 0) return false;
  const lowered = href.toLowerCase();
  if (lowered.startsWith("http://")) return true;
  if (lowered.startsWith("https://")) return true;
  if (lowered.startsWith("mailto:")) return true;
  if (lowered.startsWith("/")) return true;
  if (lowered.startsWith("#")) return true;
  return false;
}

type ChatMarkdownProps = { text: string };

export function ChatMarkdown({ text }: ChatMarkdownProps): JSX.Element {
  const blocks = parseMarkdown(text);
  return <div className="hb-chat-md">{blocks.map((block, i) => renderBlock(block, i))}</div>;
}

function renderBlock(block: MdBlock, key: number): ReactNode {
  if (block.type === "paragraph") {
    return (
      <p key={key} className="hb-chat-md-p">
        {renderInline(block.children)}
      </p>
    );
  }
  if (block.type === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag key={key} className="hb-chat-md-h">
        {renderInline(block.children)}
      </Tag>
    );
  }
  if (block.type === "blockquote") {
    return (
      <blockquote key={key} className="hb-chat-md-quote">
        {renderInline(block.children)}
      </blockquote>
    );
  }
  if (block.type === "code-block") {
    return <CodeBlock key={key} text={block.text} practice={block.practice} />;
  }
  if (block.type === "list") {
    if (block.ordered) {
      return (
        <ol key={key} className="hb-chat-md-list">
          {block.items.map((item, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable list within a static parsed message
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    }
    return (
      <ul key={key} className="hb-chat-md-list">
        {block.items.map((item, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable list within a static parsed message
          <li key={j}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  return null;
}

type CodeBlockProps = { text: string; practice?: boolean };

export function CodeBlock({ text, practice = false }: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy(): Promise<void> {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={
        practice ? "hb-chat-md-codeblock hb-chat-md-codeblock-practice" : "hb-chat-md-codeblock"
      }
    >
      <div className="hb-chat-md-codeblock-bar">
        {practice ? (
          <span className="hb-chat-md-practice-tag">Type it</span>
        ) : (
          <button
            type="button"
            className="hb-chat-md-copy"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
      </div>
      <pre className="hb-chat-md-pre">
        <code>{text}</code>
      </pre>
    </div>
  );
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function renderInline(nodes: MdInline[]): ReactNode {
  return nodes.map((node, i) => renderInlineNode(node, i));
}

function renderInlineNode(node: MdInline, key: number): ReactNode {
  if (node.type === "text") return node.text;
  if (node.type === "code") {
    return (
      <code key={key} className="hb-chat-md-code">
        {node.text}
      </code>
    );
  }
  if (node.type === "bold") {
    return <strong key={key}>{renderInline(node.children)}</strong>;
  }
  if (node.type === "italic") {
    return <em key={key}>{renderInline(node.children)}</em>;
  }
  if (node.type === "link") {
    return (
      <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
        {renderInline(node.children)}
      </a>
    );
  }
  return null;
}
