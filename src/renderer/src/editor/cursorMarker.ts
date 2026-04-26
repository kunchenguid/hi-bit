import { BIT_CURSOR_MARKER } from "@shared/cursorMarker";

export { BIT_CURSOR_MARKER };

type CursorMarkerParseResult =
  | { ok: true; surroundingContentWithMarker: string }
  | { ok: false; error: string };

type CursorMarkerPositionResult = { ok: true; position: number } | { ok: false; error: string };
type LocalCursorMarkerResult = { ok: true; position: number } | { ok: false; error: string };

function countOccurrences(text: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

export function parseCursorMarkerResponse(text: string): CursorMarkerParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Bit did not return JSON." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "Bit did not return the cursor schema." };
  }

  const value = (parsed as { surrounding_content_with_marker?: unknown })
    .surrounding_content_with_marker;
  if (typeof value !== "string") {
    return { ok: false, error: "Bit did not return the cursor schema." };
  }

  if (value.length === 0) {
    return { ok: true, surroundingContentWithMarker: "" };
  }

  if (countOccurrences(value, BIT_CURSOR_MARKER) !== 1) {
    return { ok: false, error: "Bit did not return a cursor marker." };
  }

  return { ok: true, surroundingContentWithMarker: value };
}

export function findCursorMarkerPosition(
  editorContent: string,
  surroundingContentWithMarker: string,
): CursorMarkerPositionResult {
  if (countOccurrences(surroundingContentWithMarker, BIT_CURSOR_MARKER) !== 1) {
    return { ok: false, error: "Bit did not return a cursor marker." };
  }

  const markerOffset = surroundingContentWithMarker.indexOf(BIT_CURSOR_MARKER);
  const surroundingContent = surroundingContentWithMarker.replace(BIT_CURSOR_MARKER, "");
  if (surroundingContent.length === 0) {
    return { ok: false, error: "Bit did not include enough nearby code." };
  }

  const firstMatch = editorContent.indexOf(surroundingContent);
  if (firstMatch === -1) {
    return { ok: false, error: "Bit could not match that spot in the editor." };
  }

  const secondMatch = editorContent.indexOf(
    surroundingContent,
    firstMatch + surroundingContent.length,
  );
  if (secondMatch !== -1) {
    return { ok: false, error: "Bit found more than one matching spot." };
  }

  return { ok: true, position: firstMatch + markerOffset };
}

export function findLocalCursorMarkerPosition(
  editorContent: string,
  latestBitMessage: string,
): LocalCursorMarkerResult {
  const lineResult = findLineHintPosition(editorContent, latestBitMessage);
  if (lineResult.ok) return lineResult;

  const lowerMessage = latestBitMessage.toLowerCase();
  if (lowerMessage.includes("paragraph") || latestBitMessage.includes("<p")) {
    const paragraph = editorContent.match(/^[ \t]*<p\b[^>]*>/m);
    if (paragraph?.index !== undefined) return { ok: true, position: paragraph.index };
  }

  if (lowerMessage.includes("heading") || latestBitMessage.includes("<h1")) {
    const heading = editorContent.match(/<h1\b[^>]*>/i);
    if (heading?.index !== undefined)
      return { ok: true, position: heading.index + heading[0].length };
  }

  if (lowerMessage.includes("body") || latestBitMessage.includes("<body")) {
    const body = editorContent.match(/<body\b[^>]*>/i);
    if (body?.index !== undefined) {
      const lineEnd = editorContent.indexOf("\n", body.index + body[0].length);
      return { ok: true, position: lineEnd === -1 ? body.index + body[0].length : lineEnd + 1 };
    }
  }

  return { ok: false, error: "Bit could not find the spot from the message." };
}

function findLineHintPosition(
  editorContent: string,
  latestBitMessage: string,
): LocalCursorMarkerResult {
  const match = latestBitMessage.match(/\bline\s+(\d+)\b/i);
  if (!match?.[1]) return { ok: false, error: "No line hint." };
  const lineNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(lineNumber) || lineNumber < 1) {
    return { ok: false, error: "Bad line hint." };
  }

  let position = 0;
  for (let currentLine = 1; currentLine < lineNumber; currentLine += 1) {
    const nextBreak = editorContent.indexOf("\n", position);
    if (nextBreak === -1) return { ok: false, error: "Line hint is outside the editor." };
    position = nextBreak + 1;
  }
  return { ok: true, position };
}
