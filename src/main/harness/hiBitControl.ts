export type HiBitControlBlock = {
  name: string;
  raw: string;
  body: string;
};

const CONTROL_BLOCK_RE = /<hi-bit:([a-z0-9-]+)\b[^>]*>([\s\S]*?)<\/hi-bit:\1>/gi;
const CONTROL_PREFIX = "<hi-bit:";

export function extractHiBitControlBlocks(text: string): HiBitControlBlock[] {
  const blocks: HiBitControlBlock[] = [];
  for (const match of text.matchAll(CONTROL_BLOCK_RE)) {
    const raw = match[0];
    const name = match[1];
    const body = match[2];
    if (!name || body === undefined) continue;
    blocks.push({ name, raw, body });
  }
  return blocks;
}

export function stripHiBitControlBlocks(text: string): string {
  return text.replace(CONTROL_BLOCK_RE, "");
}

export function createHiBitControlStreamFilter(onVisible: (text: string) => void): {
  push: (text: string) => void;
  finish: () => void;
} {
  let buffer = "";
  let hiddenName: string | null = null;

  function emit(text: string): void {
    if (text.length > 0) onVisible(text);
  }

  function processVisible(text: string): void {
    let remaining = text;
    while (remaining.length > 0) {
      const start = remaining.indexOf(CONTROL_PREFIX);
      if (start === -1) {
        const keep = controlPrefixSuffixLength(remaining);
        if (keep > 0) {
          emit(remaining.slice(0, -keep));
          buffer = remaining.slice(-keep);
        } else {
          emit(remaining);
          buffer = "";
        }
        return;
      }

      emit(remaining.slice(0, start));
      const afterStart = remaining.slice(start);
      const open = afterStart.match(/^<hi-bit:([a-z0-9-]+)\b[^>]*>/i);
      if (!open) {
        buffer = afterStart;
        return;
      }

      const name = open[1] ?? "";
      const openEnd = open[0].length;
      const closeTag = `</hi-bit:${name}>`;
      const close = afterStart.indexOf(closeTag, openEnd);
      if (close === -1) {
        hiddenName = name;
        buffer = afterStart.slice(openEnd);
        return;
      }
      remaining = afterStart.slice(close + closeTag.length);
    }
  }

  function processHidden(text: string): void {
    if (!hiddenName) {
      processVisible(text);
      return;
    }
    const closeTag = `</hi-bit:${hiddenName}>`;
    const close = text.indexOf(closeTag);
    if (close === -1) {
      const keep = prefixSuffixLength(text, closeTag);
      buffer = keep > 0 ? text.slice(-keep) : "";
      return;
    }
    const rest = text.slice(close + closeTag.length);
    hiddenName = null;
    buffer = "";
    processVisible(rest);
  }

  return {
    push(text: string): void {
      const combined = buffer + text;
      buffer = "";
      if (hiddenName) processHidden(combined);
      else processVisible(combined);
    },
    finish(): void {
      if (!hiddenName) emit(buffer);
      buffer = "";
      hiddenName = null;
    },
  };
}

function controlPrefixSuffixLength(text: string): number {
  return prefixSuffixLength(text, CONTROL_PREFIX);
}

function prefixSuffixLength(text: string, prefix: string): number {
  const max = Math.min(text.length, prefix.length - 1);
  for (let len = max; len > 0; len -= 1) {
    if (prefix.startsWith(text.slice(-len))) return len;
  }
  return 0;
}
