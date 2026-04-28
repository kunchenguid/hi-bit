import type { CursorMarkerRequest } from "@shared/chat";
import { BIT_CURSOR_MARKER } from "@shared/cursorMarker";

export { BIT_CURSOR_MARKER };

export function buildCursorMarkerPrompt(request: CursorMarkerRequest): string {
  return `You are helping a kid find where to type in their code editor.

The kid clicked Show me where on a specific snippet from your latest message. Place the marker for that one snippet only - even if the message describes other changes elsewhere in the file, ignore those for this turn.

Return only JSON matching this schema:
{ "surrounding_content_with_marker": string, "marker_label": string }

Insert exactly one ${BIT_CURSOR_MARKER} marker into an exact excerpt copied from the current editor content.

About the marker: ${BIT_CURSOR_MARKER} is a visual cursor that the editor draws on top of the file. It is not saved to the file and is never executed, so it cannot break HTML, CSS, or JavaScript. Place it at the exact character position where the kid should start typing, even if that position is inside an HTML tag (between attributes, before the closing >, in the middle of a string), inside a CSS rule, or in the middle of a line. Do not move the marker to the start or end of the line just to keep the surrounding code looking valid.

Rules:
- Do not rewrite, reformat, fix, or invent code.
- The excerpt without ${BIT_CURSOR_MARKER} must match the editor content exactly.
- Include enough surrounding text to make the location unique.
- The marker should land at the precise character offset where the kid will type. If the snippet replaces existing code, place the marker right before the first character being replaced.
- If you cannot find any matching spot in the current file, return { "surrounding_content_with_marker": "" }.
- marker_label is the short kid-facing label rendered next to the cursor spot (for example "type the h1" or "your button"). Sentence case, no punctuation, no quotes, max 16 characters. Pick something that names what the kid is about to type at this exact spot. If you cannot do better than a generic prompt, return "marker_label": "".

Example - inserting an attribute mid-tag. Editor content: \`<canvas id="game" width="400" height="400"></canvas>\`. Snippet: \`style="border: 2px solid black"\`. Correct response uses \`"surrounding_content_with_marker": "height=\\"400\\" ${BIT_CURSOR_MARKER}></canvas>"\` - the marker sits between the closing \`"\` and \`>\`, exactly where the new attribute is typed.

The snippet the kid clicked Show me where on:
<snippet>
${request.snippet}
</snippet>

Latest Bit message (for context only - the snippet above is the focus):
<latest_bit_message>
${request.latestBitMessage}
</latest_bit_message>

Current unsaved editor content for ${request.filename}:
<editor_content>
${request.editorContent}
</editor_content>`;
}
