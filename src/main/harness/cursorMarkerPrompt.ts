import type { CursorMarkerRequest } from "@shared/chat";
import { BIT_CURSOR_MARKER } from "@shared/cursorMarker";

export { BIT_CURSOR_MARKER };

export function buildCursorMarkerPrompt(request: CursorMarkerRequest): string {
  return `You are helping a kid find where to type in their code editor.

The kid clicked Show me where on a specific snippet from your latest message. Place the marker for that one snippet only - even if the message describes other changes elsewhere in the file, ignore those for this turn.

Return only JSON matching this schema:
{ "surrounding_content_with_marker": string, "marker_label": string }

Insert exactly one ${BIT_CURSOR_MARKER} marker into an exact excerpt copied from the current editor content.

Rules:
- Do not rewrite, reformat, fix, or invent code.
- The excerpt without ${BIT_CURSOR_MARKER} must match the editor content exactly.
- Include enough surrounding text to make the location unique.
- The marker should land where the kid will put the snippet (an empty insertion point) or where the snippet replaces existing code (just before the line being replaced).
- If you cannot identify a safe place, return { "surrounding_content_with_marker": "" }.
- marker_label is the short kid-facing label rendered next to the cursor spot (for example "type the h1" or "your button"). Sentence case, no punctuation, no quotes, max 16 characters. Pick something that names what the kid is about to type at this exact spot. If you cannot do better than a generic prompt, return "marker_label": "".

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
