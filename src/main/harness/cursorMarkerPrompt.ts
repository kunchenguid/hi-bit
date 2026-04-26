import type { CursorMarkerRequest } from "@shared/chat";
import { BIT_CURSOR_MARKER } from "@shared/cursorMarker";

export { BIT_CURSOR_MARKER };

export function buildCursorMarkerPrompt(request: CursorMarkerRequest): string {
  return `You are helping a kid find where to type in their code editor.

Return only JSON matching this schema:
{ "surrounding_content_with_marker": string }

Insert exactly one ${BIT_CURSOR_MARKER} marker into an exact excerpt copied from the current editor content.

Rules:
- Do not rewrite, reformat, fix, or invent code.
- The excerpt without ${BIT_CURSOR_MARKER} must match the editor content exactly.
- Include enough surrounding text to make the location unique.
- If you cannot identify a safe place, return { "surrounding_content_with_marker": "" }.

Latest Bit message:
<latest_bit_message>
${request.latestBitMessage}
</latest_bit_message>

Current unsaved editor content for ${request.filename}:
<editor_content>
${request.editorContent}
</editor_content>`;
}
