export type SavedProjectFile = {
  profileId: string;
  filename: string;
  slug: string;
  before: string;
  after: string;
};

const SYSTEM_NOTE_PREFIX = "[Hi-Bit system note - this is from the editor, not from the kid]";
const SAVE_HEADER = "The kid just clicked Save in Hi Bit.";

export function buildSavedFilePrompt(saved: SavedProjectFile): string {
  const diff = buildLineDiff(saved.before, saved.after);
  return [
    SYSTEM_NOTE_PREFIX,
    SAVE_HEADER,
    `File saved: ${saved.filename}`,
    `Project: ${saved.slug}`,
    "Use the diff below instead of reading the file first. React to what changed, name what worked or what looks off, and guide the kid to the next small step.",
    "",
    "```diff",
    diff,
    "```",
  ].join("\n");
}

export function isSavedFilePrompt(text: string): boolean {
  return savedFilePromptLabel(text) !== null;
}

export function savedFilePromptLabel(text: string): string | null {
  const lines = text.trimStart().split("\n");
  let cursor = 0;
  if (lines[cursor] === SYSTEM_NOTE_PREFIX) cursor += 1;
  if (lines[cursor] !== SAVE_HEADER) return null;
  const filename = lines[cursor + 1]?.match(/^File saved: (.+)$/)?.[1]?.trim();
  if (!filename) return null;
  return `Saved ${filename}`;
}

export function buildLineDiff(before: string, after: string): string {
  if (before === after) return " No content changes.";

  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const table = buildLcsTable(beforeLines, afterLines);
  const rows: string[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      rows.push(` ${beforeLines[i]}`);
      i += 1;
      j += 1;
    } else if (table[i + 1]?.[j] ?? 0 >= (table[i]?.[j + 1] ?? 0)) {
      rows.push(`-${beforeLines[i]}`);
      i += 1;
    } else {
      rows.push(`+${afterLines[j]}`);
      j += 1;
    }
  }

  while (i < beforeLines.length) {
    rows.push(`-${beforeLines[i]}`);
    i += 1;
  }
  while (j < afterLines.length) {
    rows.push(`+${afterLines[j]}`);
    j += 1;
  }

  return rows.join("\n");
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

function buildLcsTable(a: string[], b: string[]): number[][] {
  const table = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}
